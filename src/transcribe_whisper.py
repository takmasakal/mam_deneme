#!/usr/bin/env python3
import argparse
import os
import sys

from faster_whisper import WhisperModel


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


def write_vtt(path: str, segments) -> int:
    cue_count = 0
    with open(path, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for seg in segments:
            text = (seg.text or "").strip()
            if not text:
                continue
            start = fmt_ts(seg.start)
            end = fmt_ts(seg.end if seg.end > seg.start else seg.start + 0.5)
            f.write(f"{start} --> {end}\n")
            f.write(text + "\n\n")
            cue_count += 1
    return cue_count


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

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    lang = (args.lang or "").strip().lower()
    if lang in ("", "auto", "und"):
        lang = None

    segments, _info = model.transcribe(
        in_path,
        language=lang,
        beam_size=5,
        vad_filter=True,
        word_timestamps=False
    )

    cue_count = write_vtt(out_path, segments)
    print(f"ok cues={cue_count} output={out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
