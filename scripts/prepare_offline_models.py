#!/usr/bin/env python3
"""Prepare ML model caches during installation/build.

This script intentionally downloads models only when it is run explicitly
(typically from Docker build args). Runtime code should use the cached models
in offline mode and fail clearly if a required cache is missing.
"""

import argparse
import os
import sys


DEFAULT_MODEL_CACHE = "/opt/mam-models"


def _truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def configure_cache(cache_root: str) -> tuple[str, str]:
    cache_root = os.path.abspath(cache_root or DEFAULT_MODEL_CACHE)
    hf_home = os.path.join(cache_root, "huggingface")
    paddle_home = os.path.join(cache_root, "paddle")
    os.makedirs(hf_home, exist_ok=True)
    os.makedirs(paddle_home, exist_ok=True)
    os.environ.setdefault("HF_HOME", hf_home)
    os.environ.setdefault("HF_HUB_CACHE", os.path.join(hf_home, "hub"))
    os.environ.setdefault("TRANSFORMERS_CACHE", os.path.join(hf_home, "transformers"))
    os.environ.setdefault("WHISPER_MODEL_CACHE", hf_home)
    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", paddle_home)
    os.environ.setdefault("PADDLE_HOME", paddle_home)
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    return hf_home, paddle_home


def preload_faster_whisper(model_name: str, hf_home: str) -> None:
    from faster_whisper import WhisperModel

    model_name = str(model_name or "small").strip() or "small"
    print(f"Preparing faster-whisper model cache: {model_name}")
    WhisperModel(
        model_name,
        device="cpu",
        compute_type="int8",
        download_root=hf_home,
        local_files_only=False,
    )
    print(f"Prepared faster-whisper model cache: {model_name}")


def preload_paddle_ocr() -> None:
    from paddleocr import PaddleOCR

    configs = [
        ("tr/latin", "PP-OCRv5_mobile_det", "latin_PP-OCRv5_mobile_rec"),
        ("en", "PP-OCRv5_mobile_det", "en_PP-OCRv5_mobile_rec"),
    ]
    for label, det_model, rec_model in configs:
        print(f"Preparing PaddleOCR model cache: {label}")
        PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            enable_mkldnn=False,
            cpu_threads=1,
            text_detection_model_name=det_model,
            text_recognition_model_name=rec_model,
        )
        print(f"Prepared PaddleOCR model cache: {label}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare MAM offline model caches")
    parser.add_argument("--cache-root", default=os.getenv("MAM_MODEL_CACHE_DIR", DEFAULT_MODEL_CACHE))
    parser.add_argument("--whisper-model", default=os.getenv("WHISPER_MODEL", "small"))
    parser.add_argument("--skip-whisper", action="store_true")
    parser.add_argument("--paddle-ocr", action="store_true")
    parser.add_argument("--skip-paddle-ocr", action="store_true")
    args = parser.parse_args()

    hf_home, _paddle_home = configure_cache(args.cache_root)

    if not args.skip_whisper:
        preload_faster_whisper(args.whisper_model, hf_home)

    should_preload_paddle = args.paddle_ocr and not args.skip_paddle_ocr
    if should_preload_paddle:
        preload_paddle_ocr()
    elif _truthy(os.getenv("PRELOAD_PADDLE_OCR", "false")) and not args.skip_paddle_ocr:
        preload_paddle_ocr()
    else:
        print("Skipping PaddleOCR model preload.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
