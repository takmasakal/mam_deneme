#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys

# Avoid startup connectivity checks against model hosters in restricted networks.
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", "/app/uploads/.paddlex")
os.environ.setdefault("PADDLE_HOME", "/app/uploads/.paddlex")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_allocator_strategy", "naive_best_fit")

def map_lang(raw: str) -> str:
    value = (raw or "").strip().lower()
    if not value:
        return "tr"
    tokens = [tok for tok in re.split(r"[+,;\\s]+", value) if tok]
    if not tokens:
        return "tr"
    aliases = {
        "eng": "en",
        "en": "en",
        "tur": "tr",
        "tr": "tr",
        "deu": "german",
        "ger": "german",
        "fra": "french",
        "fr": "french",
        "spa": "es",
        "es": "es",
        "ita": "it",
        "it": "it",
        "por": "pt",
        "pt": "pt",
        "ch": "ch",
        "chi": "ch",
        "jpn": "japan",
        "ja": "japan",
        "kor": "korean",
        "ko": "korean",
        "latin": "tr",
    }
    mapped = [aliases.get(token, "") for token in tokens]
    if "tr" in mapped:
        return "tr"
    if "en" in mapped:
        return "en"
    for item in mapped:
        if item:
            return item
    return "en"


def pick_models(lang: str):
    # Prefer lightweight mobile models for better runtime stability on CPU.
    if lang in {"tr", "german", "french", "es", "it", "pt"}:
        return ("PP-OCRv5_mobile_det", "latin_PP-OCRv5_mobile_rec")
    if lang == "en":
        return ("PP-OCRv5_mobile_det", "en_PP-OCRv5_mobile_rec")
    if lang in {"korean", "th", "el", "te", "ta"}:
        return ("PP-OCRv5_mobile_det", f"{lang}_PP-OCRv5_mobile_rec")
    return ("", "")


def list_frames(frames_dir: str):
    names = []
    for name in os.listdir(frames_dir):
        if re.match(r"^frame-\d+\.jpg$", name, flags=re.IGNORECASE):
            names.append(name)
    names.sort(key=lambda s: [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", s)])
    return names


def extract_text(result):
    texts = []
    def append_dict_values(obj):
        if not isinstance(obj, dict):
            return
        rec_texts = obj.get("rec_texts")
        if isinstance(rec_texts, list):
            for txt in rec_texts:
                s = str(txt or "").strip()
                if s:
                    texts.append(s)
        elif rec_texts is not None:
            s = str(rec_texts).strip()
            if s:
                texts.append(s)
        text_val = obj.get("text")
        if text_val is not None:
            s = str(text_val).strip()
            if s:
                texts.append(s)

    if not result:
        return ""
    if isinstance(result, dict):
        append_dict_values(result)
        if texts:
            return " ".join(texts).strip()
    for block in result if isinstance(result, list) else [result]:
        if not block:
            continue
        if isinstance(block, dict):
            append_dict_values(block)
            continue
        lines = block if isinstance(block, list) else [block]
        for line in lines:
            if not line:
                continue
            if isinstance(line, dict):
                append_dict_values(line)
                continue
            if not isinstance(line, (list, tuple)) or len(line) < 2:
                continue
            rec = line[1]
            if isinstance(rec, (list, tuple)) and rec:
                txt = str(rec[0] or "").strip()
            else:
                txt = str(rec or "").strip()
            if txt:
                texts.append(txt)
    return " ".join(texts).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--lang", default="eng+tur")
    args = parser.parse_args()

    frames_dir = os.path.abspath(args.frames_dir)
    if not os.path.isdir(frames_dir):
        print("frames directory not found", file=sys.stderr)
        sys.exit(2)

    try:
        from paddleocr import PaddleOCR
    except Exception as exc:  # pragma: no cover
        print(f"PaddleOCR import failed: {exc}", file=sys.stderr)
        sys.exit(3)

    lang = map_lang(args.lang)
    det_model, rec_model = pick_models(lang)
    try:
        # Keep the pipeline lightweight in server mode to reduce model init failures.
        cfg = {
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            "enable_mkldnn": False,
            "cpu_threads": 1,
        }
        if det_model and rec_model:
            cfg["text_detection_model_name"] = det_model
            cfg["text_recognition_model_name"] = rec_model
        else:
            cfg["lang"] = lang
        ocr = PaddleOCR(**cfg)
    except Exception as exc:
        print(f"PaddleOCR init failed: {exc}", file=sys.stderr)
        sys.exit(4)

    items = []
    for name in list_frames(frames_dir):
        img_path = os.path.join(frames_dir, name)
        try:
            if hasattr(ocr, "predict"):
                result = ocr.predict(img_path)
            else:
                result = ocr.ocr(img_path)
            text = extract_text(result)
        except Exception:
            text = ""
        items.append({"name": name, "text": text})

    payload = {
        "engine": "paddle",
        "lang": lang,
        "detModel": det_model or "",
        "recModel": rec_model or "",
        "items": items,
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
