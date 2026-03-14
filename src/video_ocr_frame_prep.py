#!/usr/bin/env python3
import argparse
import json
import os
import re
from typing import Dict, List, Tuple

import cv2
import numpy as np


def list_frames(frames_dir: str) -> List[str]:
    names: List[str] = []
    for name in os.listdir(frames_dir):
        if re.match(r"^(?:frame|scene)-\d+\.jpg$", name, flags=re.IGNORECASE):
            names.append(name)
    names.sort(key=lambda s: [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", s)])
    return names


def estimate_blur(image: np.ndarray) -> float:
    if image is None:
        return 0.0
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(np.sum(edges > 0) / edges.size)
    lap_norm = min(lap_var, 300.0)
    edge_norm = min(edge_density * 300.0, 300.0)
    return float(0.6 * lap_norm + 0.4 * edge_norm)


def deskew_image(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    coords = np.column_stack(np.where(binary > 0))
    if len(coords) == 0:
        return image
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    if abs(angle) < 1.0 or abs(angle) > 45:
        return image
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(image, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def denoise_image(image: np.ndarray, method: str = "bilateral") -> np.ndarray:
    if method == "gaussian":
        return cv2.GaussianBlur(image, (3, 3), 0)
    if method == "median":
        return cv2.medianBlur(image, 3)
    return cv2.bilateralFilter(image, 9, 75, 75)


def enhance_contrast(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 3:
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l_channel = lab[:, :, 0]
    else:
        l_channel = image
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(l_channel)
    if len(image.shape) == 3:
        lab[:, :, 0] = enhanced
        return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    return enhanced


def sharpen_image(image: np.ndarray, kernel_size: int = 3, strength: float = 0.8) -> np.ndarray:
    blurred = cv2.GaussianBlur(image, (kernel_size, kernel_size), 0)
    return cv2.addWeighted(image, 1.0 + strength, blurred, -strength, 0)


def preprocess(image: np.ndarray, profile: str) -> np.ndarray:
    profile = str(profile or "light").strip().lower()
    if profile == "off":
        return image
    out = denoise_image(image, method="bilateral")
    out = enhance_contrast(out)
    if profile == "strong":
        out = deskew_image(out)
        out = sharpen_image(out)
    return out


def crop_ticker(image: np.ndarray, ticker_height_pct: int) -> np.ndarray:
    h = image.shape[0]
    split_y = int(h * (1 - (ticker_height_pct / 100.0)))
    split_y = max(0, min(h, split_y))
    return image[split_y:h, :]


def process_frames(
    frames_dir: str,
    profile: str,
    enable_blur_filter: bool,
    blur_threshold: float,
    enable_region_mode: bool,
    ticker_height_pct: int
) -> Tuple[List[str], List[str], Dict[str, str]]:
    kept: List[str] = []
    skipped_blur: List[str] = []
    ticker_map: Dict[str, str] = {}
    for name in list_frames(frames_dir):
        frame_path = os.path.join(frames_dir, name)
        image = cv2.imread(frame_path)
        if image is None:
            continue

        if enable_blur_filter:
            score = estimate_blur(image)
            if score < blur_threshold:
                skipped_blur.append(name)
                continue

        processed = preprocess(image, profile)
        cv2.imwrite(frame_path, processed)
        kept.append(name)

        if enable_region_mode:
            ticker = crop_ticker(processed, ticker_height_pct)
            ticker_name = f"ticker_{name}"
            ticker_path = os.path.join(frames_dir, ticker_name)
            cv2.imwrite(ticker_path, ticker)
            ticker_map[name] = ticker_name

    return kept, skipped_blur, ticker_map


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-dir", required=True)
    parser.add_argument("--profile", default="light")
    parser.add_argument("--enable-blur-filter", action="store_true")
    parser.add_argument("--blur-threshold", type=float, default=80.0)
    parser.add_argument("--enable-region-mode", action="store_true")
    parser.add_argument("--ticker-height-pct", type=int, default=20)
    args = parser.parse_args()

    frames_dir = os.path.abspath(args.frames_dir)
    if not os.path.isdir(frames_dir):
        raise SystemExit("frames directory not found")

    kept, skipped_blur, ticker_map = process_frames(
        frames_dir=frames_dir,
        profile=args.profile,
        enable_blur_filter=bool(args.enable_blur_filter),
        blur_threshold=float(args.blur_threshold),
        enable_region_mode=bool(args.enable_region_mode),
        ticker_height_pct=max(10, min(40, int(args.ticker_height_pct)))
    )
    payload = {
        "kept": kept,
        "skipped_blur": skipped_blur,
        "ticker_map": ticker_map
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
