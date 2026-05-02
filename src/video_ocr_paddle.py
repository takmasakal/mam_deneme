#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys

# Avoid startup connectivity checks against model hosters in restricted networks.
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
_MODEL_CACHE_ROOT = os.getenv("MAM_MODEL_CACHE_DIR", "/opt/mam-models")
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", os.path.join(_MODEL_CACHE_ROOT, "paddle"))
os.environ.setdefault("PADDLE_HOME", os.path.join(_MODEL_CACHE_ROOT, "paddle"))
if str(os.getenv("MAM_OFFLINE_MODE", "true")).strip().lower() in {"1", "true", "yes", "on"}:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
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
        if re.match(r"^(?:frame-\d+|scene-\d+|ticker_frame-\d+|ticker_scene-\d+)\.jpg$", name, flags=re.IGNORECASE):
            names.append(name)
    names.sort(key=lambda s: [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", s)])
    return names


def safe_float(v, default=0.0):
    try:
        return float(v)
    except Exception:
        return float(default)


def safe_confidence(v, default=0.0):
    try:
        n = float(v)
    except Exception:
        return float(default)
    if not (n >= 0.0):
        return float(default)
    if n > 1.0:
        # Some OCR outputs can expose percentage-like values.
        if n <= 100.0:
            n = n / 100.0
        else:
            n = 1.0
    return max(0.0, min(1.0, n))


def normalize_bbox(raw_bbox):
    if raw_bbox is None:
        return None
    if hasattr(raw_bbox, "tolist"):
        raw_bbox = raw_bbox.tolist()
    if not isinstance(raw_bbox, (list, tuple)) or len(raw_bbox) == 0:
        return None
    if len(raw_bbox) == 4 and all(isinstance(v, (int, float)) for v in raw_bbox):
        left, top, right, bottom = [safe_float(v, 0.0) for v in raw_bbox]
        if right <= left or bottom <= top:
            return None
        return [left, top, right, bottom]
    pts = []
    for pt in raw_bbox:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            x = safe_float(pt[0], 0.0)
            y = safe_float(pt[1], 0.0)
            pts.append((x, y))
    if len(pts) < 2:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    left = min(xs)
    right = max(xs)
    top = min(ys)
    bottom = max(ys)
    if right <= left or bottom <= top:
        return None
    return [left, top, right, bottom]


def append_entry(entries, text, bbox, confidence=0.0):
    s = re.sub(r"\s+", " ", str(text or "").strip())
    if not s:
        return
    entries.append({"text": s, "bbox": bbox, "confidence": safe_confidence(confidence, 0.0)})


def collect_entries_from_dict(block):
    entries = []
    if not isinstance(block, dict):
        return entries
    rec_texts = block.get("rec_texts")
    rec_scores = block.get("rec_scores")
    rec_boxes = block.get("rec_polys")
    if rec_boxes is None:
        rec_boxes = block.get("dt_polys")
    if rec_boxes is None:
        rec_boxes = block.get("det_polys")
    if rec_boxes is None:
        rec_boxes = block.get("rec_boxes")
    if hasattr(rec_boxes, "tolist"):
        rec_boxes = rec_boxes.tolist()
    if isinstance(rec_texts, list):
        for idx, txt in enumerate(rec_texts):
            bbox = None
            if isinstance(rec_boxes, list) and idx < len(rec_boxes):
                bbox = normalize_bbox(rec_boxes[idx])
            conf = 0.0
            if isinstance(rec_scores, list) and idx < len(rec_scores):
                conf = safe_confidence(rec_scores[idx], 0.0)
            append_entry(entries, txt, bbox, conf)
    text_val = block.get("text")
    if text_val is not None and not entries:
        append_entry(entries, text_val, None, block.get("score", block.get("confidence", 0.0)))
    return entries


def extract_entries(result):
    entries = []
    if not result:
        return entries
    blocks = result if isinstance(result, list) else [result]
    for block in blocks:
        if not block:
            continue
        if isinstance(block, dict):
            entries.extend(collect_entries_from_dict(block))
            continue
        lines = block if isinstance(block, list) else [block]
        for line in lines:
            if not line:
                continue
            if isinstance(line, dict):
                entries.extend(collect_entries_from_dict(line))
                continue
            if not isinstance(line, (list, tuple)) or len(line) < 2:
                continue
            bbox = normalize_bbox(line[0])
            rec = line[1]
            if isinstance(rec, (list, tuple)) and rec:
                conf = rec[1] if len(rec) > 1 else 0.0
                append_entry(entries, rec[0], bbox, conf)
            else:
                append_entry(entries, rec, bbox, 0.0)
    return entries


def dedupe_texts(texts):
    out = []
    seen = set()
    for item in texts:
        s = re.sub(r"\s+", " ", str(item or "").strip())
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def group_entries_into_blocks(entries, img_w, img_h):
    if not entries:
        return []
    has_bbox = any(isinstance(e.get("bbox"), list) and len(e["bbox"]) == 4 for e in entries)
    if not has_bbox:
        return dedupe_texts([e.get("text", "") for e in entries])

    w = max(1.0, safe_float(img_w, 1.0))
    h = max(1.0, safe_float(img_h, 1.0))
    x_gap_block = w / 20.0
    y_gap_block = h / 12.0
    y_line_tol = max(6.0, h / 55.0)

    valid = []
    for item in entries:
        bbox = item.get("bbox")
        if not (isinstance(bbox, list) and len(bbox) == 4):
            continue
        left, top, right, bottom = [safe_float(v, 0.0) for v in bbox]
        if right <= left or bottom <= top:
            continue
        valid.append({
            "text": str(item.get("text", "")).strip(),
            "left": left,
            "top": top,
            "right": right,
            "bottom": bottom,
            "cy": (top + bottom) / 2.0
        })
    if not valid:
        return dedupe_texts([e.get("text", "") for e in entries])

    valid.sort(key=lambda e: (e["cy"], e["left"]))
    lines = []
    for item in valid:
        placed = False
        for line in lines:
            if abs(item["cy"] - line["cy"]) <= y_line_tol:
                line["items"].append(item)
                line["cy"] = (line["cy"] * (len(line["items"]) - 1) + item["cy"]) / len(line["items"])
                line["top"] = min(line["top"], item["top"])
                line["bottom"] = max(line["bottom"], item["bottom"])
                placed = True
                break
        if not placed:
            lines.append({
                "items": [item],
                "cy": item["cy"],
                "top": item["top"],
                "bottom": item["bottom"]
            })

    line_segments = []
    for line in lines:
        items = sorted(line["items"], key=lambda e: e["left"])
        if not items:
            continue
        current = {
            "texts": [items[0]["text"]],
            "left": items[0]["left"],
            "right": items[0]["right"],
            "top": items[0]["top"],
            "bottom": items[0]["bottom"]
        }
        for item in items[1:]:
            gap = item["left"] - current["right"]
            if gap > x_gap_block:
                line_segments.append(current)
                current = {
                    "texts": [item["text"]],
                    "left": item["left"],
                    "right": item["right"],
                    "top": item["top"],
                    "bottom": item["bottom"]
                }
            else:
                current["texts"].append(item["text"])
                current["right"] = max(current["right"], item["right"])
                current["top"] = min(current["top"], item["top"])
                current["bottom"] = max(current["bottom"], item["bottom"])
        line_segments.append(current)

    line_segments.sort(key=lambda s: (s["top"], s["left"]))
    blocks = []
    for seg in line_segments:
        seg_text = re.sub(r"\s+", " ", " ".join(seg["texts"]).strip())
        if not seg_text:
            continue
        if not blocks:
            blocks.append({
                "texts": [seg_text],
                "left": seg["left"],
                "right": seg["right"],
                "top": seg["top"],
                "bottom": seg["bottom"]
            })
            continue
        prev = blocks[-1]
        v_gap = seg["top"] - prev["bottom"]
        h_overlap = min(seg["right"], prev["right"]) - max(seg["left"], prev["left"])
        h_sep = 0.0
        if seg["left"] > prev["right"]:
            h_sep = seg["left"] - prev["right"]
        elif prev["left"] > seg["right"]:
            h_sep = prev["left"] - seg["right"]
        same_block = (v_gap <= y_gap_block) and (h_overlap > 0 or h_sep <= x_gap_block)
        if same_block:
            prev["texts"].append(seg_text)
            prev["left"] = min(prev["left"], seg["left"])
            prev["right"] = max(prev["right"], seg["right"])
            prev["top"] = min(prev["top"], seg["top"])
            prev["bottom"] = max(prev["bottom"], seg["bottom"])
        else:
            blocks.append({
                "texts": [seg_text],
                "left": seg["left"],
                "right": seg["right"],
                "top": seg["top"],
                "bottom": seg["bottom"]
            })

    out = []
    for block in blocks:
        joined = re.sub(r"\s+", " ", " ".join(block["texts"]).strip())
        if joined:
            out.append(joined)
    return dedupe_texts(out)


def extract_texts(result):
    return dedupe_texts([e.get("text", "") for e in extract_entries(result)])


def get_image_size(img_path):
    try:
        import cv2
        img = cv2.imread(img_path)
        if img is not None and len(img.shape) >= 2:
            return float(img.shape[1]), float(img.shape[0])
    except Exception:
        pass
    return 1920.0, 1080.0


def compute_frame_confidence(entries):
    vals = [safe_confidence(item.get("confidence", 0.0), 0.0) for item in entries if item]
    vals = [v for v in vals if v > 0.0]
    if not vals:
        return 0.0
    vals.sort(reverse=True)
    # Top-heavy average: prefers high confidence tokens while still using full frame signal.
    head_n = max(1, int(round(len(vals) * 0.7)))
    head_avg = sum(vals[:head_n]) / float(head_n)
    all_avg = sum(vals) / float(len(vals))
    return round((0.7 * head_avg) + (0.3 * all_avg), 4)


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
        if str(os.getenv("MAM_OFFLINE_MODE", "true")).strip().lower() in {"1", "true", "yes", "on"}:
            print(
                f"PaddleOCR init failed in offline mode: {exc}. "
                f"Prepare OCR models during install/build with PRELOAD_PADDLE_OCR=true. Cache: {os.getenv('PADDLE_PDX_CACHE_HOME')}",
                file=sys.stderr,
            )
        else:
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
            entries = extract_entries(result)
            img_w, img_h = get_image_size(img_path)
            texts = group_entries_into_blocks(entries, img_w, img_h)
            if not texts:
                texts = extract_texts(result)
            text = " ".join(texts).strip()
            confidence = compute_frame_confidence(entries)
        except Exception:
            texts = []
            text = ""
            confidence = 0.0
        items.append({"name": name, "text": text, "texts": texts, "confidence": confidence})

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
