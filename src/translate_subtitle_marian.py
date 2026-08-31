#!/usr/bin/env python3
import argparse
import os
import re
import sys

DEFAULT_MODEL_NAME = "Helsinki-NLP/opus-mt-tc-big-en-tr"
DEFAULT_MODEL_DIR_HINT = "/opt/mam-models/marian/opus-mt-tc-big-en-tr"


def emit_progress(value, phase=""):
    print(f"MAM_PROGRESS={value} {phase}".strip(), file=sys.stderr, flush=True)


def has_local_model(model_dir):
    if not model_dir or not os.path.isdir(model_dir):
        return False
    required = ["config.json"]
    return all(os.path.exists(os.path.join(model_dir, name)) for name in required)


def ensure_model(model_dir, model_name, allow_download=False):
    if has_local_model(model_dir):
        return
    if not allow_download:
        raise FileNotFoundError(
            f"Local subtitle translation model is missing at '{model_dir}'. "
            "Prepare it before runtime with scripts/prepare_offline_models.py "
            f"--marian-model --marian-model-dir {DEFAULT_MODEL_DIR_HINT}."
        )
    from transformers import MarianMTModel, MarianTokenizer

    os.makedirs(model_dir, exist_ok=True)
    print("Local translation model not found. Downloading once because --allow-download was set.", file=sys.stderr, flush=True)
    tokenizer = MarianTokenizer.from_pretrained(model_name)
    model = MarianMTModel.from_pretrained(model_name)
    tokenizer.save_pretrained(model_dir)
    model.save_pretrained(model_dir)


def split_blocks(content):
    text = content.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    blocks = re.split(r"\n{2,}", text.strip())
    return blocks


def parse_subtitle_blocks(content, ext):
    blocks = split_blocks(content)
    header = []
    cues = []
    for block in blocks:
        lines = block.split("\n")
        stripped = [line.strip() for line in lines]
        if not stripped:
            continue
        first = stripped[0]
        if first.upper().startswith("WEBVTT") or first.upper().startswith(("NOTE", "STYLE", "REGION")):
            header.append(block)
            continue
        cue_index = ""
        time_idx = 0
        if ext == ".srt" and re.fullmatch(r"\d+", first or "") and len(stripped) > 1:
            cue_index = first
            time_idx = 1
        time_line = stripped[time_idx] if time_idx < len(stripped) else ""
        if "-->" not in time_line:
            header.append(block)
            continue
        text_lines = lines[time_idx + 1 :]
        cues.append({
            "index": cue_index,
            "time": time_line,
            "text": "\n".join(text_lines).strip(),
        })
    return header, cues


def render_subtitles(header, cues, ext):
    out = []
    if ext == ".vtt":
        if not any(str(item).upper().startswith("WEBVTT") for item in header):
            out.extend(["WEBVTT", ""])
        else:
            out.extend(header)
            out.append("")
    for idx, cue in enumerate(cues, start=1):
        if ext == ".srt":
            out.append(str(cue.get("index") or idx))
        out.append(str(cue.get("time") or ""))
        text = str(cue.get("text") or "").strip()
        if text:
            out.extend(text.split("\n"))
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def translate_subtitles(input_path, output_path, model_dir, model_name, batch_size, allow_download=False):
    ext = os.path.splitext(input_path)[1].lower()
    if ext not in (".srt", ".vtt"):
        raise ValueError("Only .srt and .vtt subtitle files are supported")
    if not os.path.exists(input_path):
        raise FileNotFoundError(input_path)

    emit_progress(5, "model_ready")
    ensure_model(model_dir, model_name, allow_download=allow_download)
    import torch
    from transformers import MarianMTModel, MarianTokenizer

    tokenizer = MarianTokenizer.from_pretrained(model_dir, local_files_only=True)
    model = MarianMTModel.from_pretrained(model_dir, local_files_only=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = model.to(device)
    model.eval()

    with open(input_path, "r", encoding="utf-8-sig") as handle:
        content = handle.read()
    header, cues = parse_subtitle_blocks(content, ext)
    translatable = [
        (idx, re.sub(r"\s+", " ", str(cue.get("text") or "").strip()))
        for idx, cue in enumerate(cues)
        if str(cue.get("text") or "").strip()
    ]
    total = len(translatable)
    if total == 0:
        raise ValueError("No subtitle text found to translate")

    emit_progress(10, "translating")
    safe_batch_size = max(1, min(64, int(batch_size or 16)))
    for start in range(0, total, safe_batch_size):
        group = translatable[start : start + safe_batch_size]
        texts = [text for _, text in group]
        inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True).to(device)
        with torch.no_grad():
            outputs = model.generate(**inputs)
        translations = tokenizer.batch_decode(outputs, skip_special_tokens=True)
        for (cue_idx, _original), translated in zip(group, translations):
            cues[cue_idx]["text"] = str(translated or "").strip()
        done = min(start + safe_batch_size, total)
        progress = 10 + round((done / total) * 82)
        emit_progress(progress, f"translating {done}/{total}")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        handle.write(render_subtitles(header, cues, ext))
    emit_progress(100, "completed")


def main():
    parser = argparse.ArgumentParser(description="Translate SRT/VTT subtitles with a local Marian model.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--allow-download", action="store_true")
    args = parser.parse_args()
    translate_subtitles(args.input, args.output, args.model_dir, args.model_name, args.batch_size, args.allow_download)


if __name__ == "__main__":
    main()
