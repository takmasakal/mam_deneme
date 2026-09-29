#!/usr/bin/env python3
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile

from faster_whisper import WhisperModel


def _truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def configure_offline_env():
    cache_root = os.getenv("MAM_MODEL_CACHE_DIR", "/opt/mam-models")
    hf_home = os.getenv("HF_HOME") or os.path.join(cache_root, "huggingface")
    os.environ.setdefault("HF_HOME", hf_home)
    os.environ.setdefault("HF_HUB_CACHE", os.path.join(hf_home, "hub"))
    os.environ.setdefault("TRANSFORMERS_CACHE", os.path.join(hf_home, "transformers"))
    os.environ.setdefault("WHISPER_MODEL_CACHE", hf_home)
    offline = _truthy(os.getenv("MAM_OFFLINE_MODE", "true"))
    if offline:
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    return offline, os.getenv("WHISPER_MODEL_CACHE") or hf_home


def fmt_ts(seconds: float) -> str:
    value = max(0.0, float(seconds))
    millis = int(round(value * 1000.0))
    hh = millis // 3600000
    millis -= hh * 3600000
    mm = millis // 60000
    millis -= mm * 60000
    ss = millis // 1000
    ms = millis - (ss * 1000)
    return f"{hh:02d}:{mm:02d}:{ss:02d}.{ms:03d}"


MAX_CUE_SECONDS = 5.5
MAX_CUE_CHARS = 84
LONG_MEDIA_THRESHOLD_SECONDS = 45 * 60
TRANSCRIPTION_CHUNK_SECONDS = 20 * 60


def _clean_token(token: str) -> str:
    return re.sub(r"\s+", " ", str(token or "").replace("\n", " ")).strip()


def _join_tokens(tokens) -> str:
    out = ""
    for token in tokens:
        t = _clean_token(token)
        if not t:
            continue
        if not out:
            out = t
            continue
        if re.match(r"^[,.;:!?…)\]\}]", t):
            out += t
        elif out.endswith(("(", "[", "{", "“", "\"", "'")):
            out += t
        else:
            out += " " + t
    return out.strip()


def _segment_to_word_chunks(seg):
    words = list(getattr(seg, "words", []) or [])
    chunks = []
    current_tokens = []
    current_start = None
    current_end = None
    for w in words:
        text = _clean_token(getattr(w, "word", ""))
        if not text:
            continue
        w_start = float(getattr(w, "start", getattr(seg, "start", 0.0)) or getattr(seg, "start", 0.0))
        w_end = float(getattr(w, "end", w_start) or w_start)
        if current_start is None:
            current_start = w_start
        next_tokens = current_tokens + [text]
        next_text = _join_tokens(next_tokens)
        predicted_end = max(w_end, current_start + 0.4)
        duration = predicted_end - current_start
        force_break = (
            bool(current_tokens)
            and (duration >= MAX_CUE_SECONDS or len(next_text) >= MAX_CUE_CHARS)
        )
        if force_break:
            flushed = _join_tokens(current_tokens)
            if flushed:
                chunks.append((current_start, max(current_end or current_start + 0.4, current_start + 0.4), flushed))
            current_tokens = [text]
            current_start = w_start
            current_end = w_end
            continue
        current_tokens.append(text)
        current_end = w_end
        if re.search(r"[.!?…]$", text) and len(next_text) >= 22:
            flushed = _join_tokens(current_tokens)
            if flushed:
                chunks.append((current_start, max(current_end or current_start + 0.4, current_start + 0.4), flushed))
            current_tokens = []
            current_start = None
            current_end = None
    if current_tokens and current_start is not None:
        flushed = _join_tokens(current_tokens)
        if flushed:
            chunks.append((current_start, max(current_end or current_start + 0.4, current_start + 0.4), flushed))
    return chunks


def _split_plain_segment(start: float, end: float, text: str):
    clean = _clean_token(text)
    if not clean:
        return []
    parts = [p.strip() for p in re.split(r"(?<=[.!?…])\s+", clean) if p.strip()]
    if not parts:
        parts = [clean]
    total_chars = max(1, sum(len(p) for p in parts))
    cur = max(0.0, float(start or 0.0))
    end = max(cur + 0.4, float(end or cur + 0.4))
    out = []
    for i, part in enumerate(parts):
        frac = len(part) / total_chars
        if i == len(parts) - 1:
            seg_end = end
        else:
            seg_end = min(end, max(cur + 0.4, cur + (end - start) * frac))
        out.append((cur, seg_end, part))
        cur = seg_end
    return out


def _build_cues(segments):
    cues = []
    for seg in segments:
        start = float(getattr(seg, "start", 0.0) or 0.0)
        end = float(getattr(seg, "end", start + 0.5) or (start + 0.5))
        if end <= start:
            end = start + 0.5
        text = _clean_token(getattr(seg, "text", ""))
        if not text:
            continue
        chunks = _segment_to_word_chunks(seg)
        # Preserve original segment timing unless we have real word-level timestamps.
        if not chunks:
            chunks = [(start, end, text)]
        cues.extend(chunks)
    return cues


def write_vtt(path: str, segments) -> int:
    return write_vtt_cues(path, _build_cues(segments))


def write_vtt_cues(path: str, cues) -> int:
    cue_count = 0
    with open(path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for start_sec, end_sec, text in cues:
            if not text:
                continue
            start = fmt_ts(start_sec)
            end = fmt_ts(end_sec if end_sec > start_sec else start_sec + 0.5)
            f.write(f"{start} --> {end}\n")
            f.write(text + "\n\n")
            cue_count += 1
    return cue_count


def probe_duration(path: str) -> float:
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", path,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return max(0.0, float((result.stdout or "0").strip() or 0.0))
    except (OSError, subprocess.SubprocessError, ValueError):
        return 0.0


def extract_audio_chunk(input_path: str, output_path: str, start: float, length: float) -> None:
    result = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", str(max(0.0, start)), "-t", str(max(1.0, length)),
            "-i", input_path, "-vn", "-ac", "1", "-ar", "16000",
            "-c:a", "pcm_s16le", output_path,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError((result.stderr or "ffmpeg failed while preparing audio chunk").strip())


def transcribe_segments(model, input_path: str, lang):
    return model.transcribe(
        input_path,
        language=lang,
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe media to WEBVTT using faster-whisper")
    parser.add_argument("--input", required=True, help="Input media file path")
    parser.add_argument("--output", required=True, help="Output VTT file path")
    parser.add_argument("--lang", default="", help="Language code (tr, en, ...). Empty for auto.")
    parser.add_argument("--model", default=os.getenv("WHISPER_MODEL", "small"), help="Whisper model size")
    args = parser.parse_args()

    in_path = os.path.abspath(args.input)
    out_path = os.path.abspath(args.output)
    out_dir = os.path.dirname(out_path)

    if not os.path.isfile(in_path):
        print("input_not_found", file=sys.stderr)
        return 2
    os.makedirs(out_dir, exist_ok=True)

    offline, model_cache = configure_offline_env()
    print("MAM_PROGRESS=10 model_loading", file=sys.stderr, flush=True)
    try:
        model = WhisperModel(
            args.model,
            device="cpu",
            compute_type="int8",
            download_root=model_cache,
            local_files_only=offline,
        )
    except Exception as exc:
        if offline:
            print(
                f"offline_model_missing: faster-whisper model '{args.model}' is not available in {model_cache}. "
                "Prepare models during install/build with PRELOAD_ML_MODELS=true or run scripts/prepare_offline_models.py.",
                file=sys.stderr,
            )
        else:
            print(f"whisper_model_load_failed: {exc}", file=sys.stderr)
        return 2
    lang = (args.lang or "").strip().lower()
    if lang in ("", "auto", "und"):
        lang = None

    print("MAM_PROGRESS=20 transcribing", file=sys.stderr, flush=True)
    duration = probe_duration(in_path)
    cues = []
    last_progress = 20
    detected_lang = lang

    def collect_segments(source_path: str, offset: float, total_duration: float):
        nonlocal last_progress, detected_lang
        segments, info = transcribe_segments(model, source_path, detected_lang)
        if detected_lang is None:
            detected_lang = str(getattr(info, "language", "") or "").strip() or None
        for segment in segments:
            for start, end, text in _build_cues([segment]):
                cues.append((start + offset, end + offset, text))
            end_sec = offset + max(0.0, float(getattr(segment, "end", 0.0) or 0.0))
            progress = min(88, 20 + int((end_sec / total_duration) * 68)) if total_duration > 0 else last_progress
            if progress >= last_progress + 2:
                last_progress = progress
                print(f"MAM_PROGRESS={progress} transcribing", file=sys.stderr, flush=True)

    try:
        if duration >= LONG_MEDIA_THRESHOLD_SECONDS:
            chunk_dir = tempfile.mkdtemp(prefix="mam-whisper-")
            try:
                offset = 0.0
                chunk_index = 0
                while offset < duration:
                    chunk_length = min(float(TRANSCRIPTION_CHUNK_SECONDS), duration - offset)
                    chunk_path = os.path.join(chunk_dir, f"chunk-{chunk_index:04d}.wav")
                    extract_audio_chunk(in_path, chunk_path, offset, chunk_length)
                    collect_segments(chunk_path, offset, duration)
                    offset += chunk_length
                    chunk_index += 1
            finally:
                shutil.rmtree(chunk_dir, ignore_errors=True)
        else:
            collect_segments(in_path, 0.0, duration)
    except Exception as exc:
        print(f"transcription_failed: {exc}", file=sys.stderr)
        return 2

    print("MAM_PROGRESS=92 writing_subtitles", file=sys.stderr, flush=True)
    cue_count = write_vtt_cues(out_path, cues)
    print(f"ok cues={cue_count} output={out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
