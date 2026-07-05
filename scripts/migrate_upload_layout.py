#!/usr/bin/env python3
"""
Migrate MAM upload paths from legacy layouts to:

  uploads/YYYY/M/D/<asset-type>/
  uploads/YYYY/M/D/previews/
  uploads/YYYY/M/D/thumbnails/
  uploads/YYYY/M/D/subtitles/
  uploads/YYYY/M/D/ocr/
  uploads/YYYY/M/D/attachments/

The script is dry-run by default. Use --apply to move files and update DB rows.
It keeps legacy rows readable by only rewriting URLs that can be mapped.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any


DEFAULT_DB_URL = "postgresql://postgres:postgres@localhost:5432/mam_mvp"
ASSET_TYPES = {"video", "audio", "document", "photo", "other"}
LEGACY_ARTIFACTS = {
    "proxies": "previews",
    "thumbnails": "thumbnails",
    "subtitles": "subtitles",
    "ocr": "ocr",
}
NEW_ARTIFACTS = {"previews", "thumbnails", "subtitles", "ocr", "attachments"}


@dataclass
class MovePlan:
    old_url: str
    new_url: str
    old_path: Path
    new_path: Path
    exists: bool
    moved: bool = False
    skipped: bool = False


def load_pg_driver():
    try:
      import psycopg  # type: ignore
      return "psycopg", psycopg
    except Exception:
      pass
    try:
      import psycopg2  # type: ignore
      return "psycopg2", psycopg2
    except Exception as exc:
      raise SystemExit(
          "Python PostgreSQL driver not found. Install psycopg or psycopg2, "
          "or run this script in an environment that has one."
      ) from exc


def connect(db_url: str):
    _name, driver = load_pg_driver()
    return driver.connect(db_url)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate MAM uploads into YYYY/M/D layout.")
    parser.add_argument("--uploads-dir", default=os.getenv("UPLOADS_DIR", "uploads"))
    parser.add_argument("--db-url", default=os.getenv("DATABASE_URL", DEFAULT_DB_URL))
    parser.add_argument("--apply", action="store_true", help="Move files and update database.")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite destination files when they differ.")
    parser.add_argument("--limit", type=int, default=0, help="Limit DB rows per table for testing.")
    return parser.parse_args()


def split_legacy_date(value: str) -> tuple[str, str, str] | None:
    parts = value.split("-")
    if len(parts) != 3:
        return None
    year, month, day = parts
    if not (year.isdigit() and month.isdigit() and day.isdigit()):
        return None
    if len(year) != 4:
        return None
    return year, str(int(month)), str(int(day))


def is_new_date_parts(parts: list[str]) -> bool:
    return len(parts) >= 3 and parts[0].isdigit() and len(parts[0]) == 4 and parts[1].isdigit() and parts[2].isdigit()


def normalize_upload_url(url: str) -> str:
    raw = str(url or "").strip().split("?", 1)[0]
    if raw.startswith("uploads/"):
        return "/" + raw
    return raw


def map_upload_url(url: str) -> str:
    raw = normalize_upload_url(url)
    if not raw.startswith("/uploads/"):
        return raw
    rel = raw[len("/uploads/") :]
    parts = [p for p in PurePosixPath(rel).parts if p not in ("", ".")]
    if len(parts) < 2:
        return raw

    # Already in the new YYYY/M/D layout.
    if is_new_date_parts(parts):
        return raw

    # Legacy original media: /uploads/YYYY-MM-DD/video/file.ext
    maybe_date = split_legacy_date(parts[0])
    if maybe_date and len(parts) >= 3 and parts[1] in ASSET_TYPES:
        return "/" + str(PurePosixPath("uploads", *maybe_date, *parts[1:]))

    # Legacy artifacts: /uploads/proxies/YYYY-MM-DD/file.ext
    target_artifact = LEGACY_ARTIFACTS.get(parts[0])
    if target_artifact and len(parts) >= 3:
        maybe_date = split_legacy_date(parts[1])
        if maybe_date:
            return "/" + str(PurePosixPath("uploads", *maybe_date, target_artifact, *parts[2:]))

    return raw


def url_to_path(uploads_dir: Path, url: str) -> Path | None:
    raw = normalize_upload_url(url)
    if not raw.startswith("/uploads/"):
        return None
    rel = raw[len("/uploads/") :]
    if ".." in PurePosixPath(rel).parts:
        return None
    return uploads_dir / Path(*PurePosixPath(rel).parts)


def map_abs_path(uploads_dir: Path, value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return raw
    path = Path(raw)
    try:
        rel = path.resolve().relative_to(uploads_dir.resolve())
    except Exception:
        return raw
    old_url = "/uploads/" + rel.as_posix()
    new_url = map_upload_url(old_url)
    new_path = url_to_path(uploads_dir, new_url)
    return str(new_path) if new_path else raw


def rewrite_json_uploads(value: Any) -> Any:
    if isinstance(value, str):
        return map_upload_url(value)
    if isinstance(value, list):
        return [rewrite_json_uploads(item) for item in value]
    if isinstance(value, dict):
        return {key: rewrite_json_uploads(item) for key, item in value.items()}
    return value


def add_move(plans: dict[str, MovePlan], uploads_dir: Path, old_url: str, new_url: str) -> None:
    if not old_url or old_url == new_url:
        return
    old_path = url_to_path(uploads_dir, old_url)
    new_path = url_to_path(uploads_dir, new_url)
    if not old_path or not new_path:
        return
    plans[old_url] = MovePlan(
        old_url=old_url,
        new_url=new_url,
        old_path=old_path,
        new_path=new_path,
        exists=old_path.exists(),
    )


def move_files(plans: dict[str, MovePlan], apply: bool, overwrite: bool) -> None:
    for plan in plans.values():
        if not plan.exists:
            plan.skipped = True
            continue
        if plan.old_path.resolve() == plan.new_path.resolve():
            plan.skipped = True
            continue
        if plan.new_path.exists():
            if plan.old_path.stat().st_size == plan.new_path.stat().st_size:
                plan.skipped = True
                continue
            if not overwrite:
                raise SystemExit(f"Destination exists and differs: {plan.new_path}")
        if apply:
            plan.new_path.parent.mkdir(parents=True, exist_ok=True)
            if overwrite and plan.new_path.exists():
                plan.new_path.unlink()
            shutil.move(str(plan.old_path), str(plan.new_path))
            plan.moved = True


def fetch_all(cur, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
    cur.execute(sql, params)
    return list(cur.fetchall())


def update_one(cur, sql: str, params: tuple[Any, ...], apply: bool) -> None:
    if apply:
        cur.execute(sql, params)


def migrate_assets(cur, uploads_dir: Path, plans: dict[str, MovePlan], apply: bool, limit: int) -> int:
    suffix = f" LIMIT {int(limit)}" if limit > 0 else ""
    rows = fetch_all(cur, f"SELECT id, media_url, proxy_url, thumbnail_url, source_path, dc_metadata FROM assets ORDER BY created_at ASC{suffix}")
    changed = 0
    for asset_id, media_url, proxy_url, thumbnail_url, source_path, dc_metadata in rows:
        new_media = map_upload_url(media_url)
        new_proxy = map_upload_url(proxy_url)
        new_thumb = map_upload_url(thumbnail_url)
        new_source = map_abs_path(uploads_dir, source_path)
        new_dc = rewrite_json_uploads(dc_metadata or {})
        for old, new in ((media_url, new_media), (proxy_url, new_proxy), (thumbnail_url, new_thumb)):
            add_move(plans, uploads_dir, normalize_upload_url(old), normalize_upload_url(new))
        if new_source != source_path:
            old_url = "/uploads/" + Path(source_path).resolve().relative_to(uploads_dir.resolve()).as_posix()
            new_url = "/uploads/" + Path(new_source).resolve().relative_to(uploads_dir.resolve()).as_posix()
            add_move(plans, uploads_dir, old_url, new_url)
        if (new_media, new_proxy, new_thumb, new_source, new_dc) != (media_url, proxy_url, thumbnail_url, source_path, dc_metadata):
            changed += 1
            update_one(
                cur,
                """
                UPDATE assets
                SET media_url = %s, proxy_url = %s, thumbnail_url = %s, source_path = %s, dc_metadata = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (new_media, new_proxy, new_thumb, new_source, json.dumps(new_dc), asset_id),
                apply,
            )
    return changed


def migrate_asset_versions(cur, uploads_dir: Path, plans: dict[str, MovePlan], apply: bool, limit: int) -> int:
    suffix = f" LIMIT {int(limit)}" if limit > 0 else ""
    rows = fetch_all(cur, f"SELECT version_id, snapshot_media_url, snapshot_source_path, snapshot_thumbnail_url FROM asset_versions ORDER BY created_at ASC{suffix}")
    changed = 0
    for version_id, media_url, source_path, thumbnail_url in rows:
        new_media = map_upload_url(media_url)
        new_thumb = map_upload_url(thumbnail_url)
        new_source = map_abs_path(uploads_dir, source_path)
        for old, new in ((media_url, new_media), (thumbnail_url, new_thumb)):
            add_move(plans, uploads_dir, normalize_upload_url(old), normalize_upload_url(new))
        if (new_media, new_source, new_thumb) != (media_url, source_path, thumbnail_url):
            changed += 1
            update_one(
                cur,
                """
                UPDATE asset_versions
                SET snapshot_media_url = %s, snapshot_source_path = %s, snapshot_thumbnail_url = %s
                WHERE version_id = %s
                """,
                (new_media, new_source, new_thumb, version_id),
                apply,
            )
    return changed


def migrate_subtitle_cues(cur, uploads_dir: Path, plans: dict[str, MovePlan], apply: bool, limit: int) -> int:
    suffix = f" LIMIT {int(limit)}" if limit > 0 else ""
    rows = fetch_all(cur, f"SELECT asset_id, seq, subtitle_url FROM asset_subtitle_cues ORDER BY asset_id, seq{suffix}")
    changed = 0
    for asset_id, seq, subtitle_url in rows:
        new_url = map_upload_url(subtitle_url)
        add_move(plans, uploads_dir, normalize_upload_url(subtitle_url), normalize_upload_url(new_url))
        if new_url != subtitle_url:
            changed += 1
            update_one(
                cur,
                "UPDATE asset_subtitle_cues SET subtitle_url = %s WHERE asset_id = %s AND seq = %s",
                (new_url, asset_id, seq),
                apply,
            )
    return changed


def migrate_ocr_segments(cur, uploads_dir: Path, plans: dict[str, MovePlan], apply: bool, limit: int) -> int:
    suffix = f" LIMIT {int(limit)}" if limit > 0 else ""
    rows = fetch_all(cur, f"SELECT asset_id, ocr_url, seq FROM asset_ocr_segments ORDER BY asset_id, ocr_url, seq{suffix}")
    changed = 0
    for asset_id, ocr_url, seq in rows:
        new_url = map_upload_url(ocr_url)
        add_move(plans, uploads_dir, normalize_upload_url(ocr_url), normalize_upload_url(new_url))
        if new_url != ocr_url:
            changed += 1
            update_one(
                cur,
                "UPDATE asset_ocr_segments SET ocr_url = %s WHERE asset_id = %s AND ocr_url = %s AND seq = %s",
                (new_url, asset_id, ocr_url, seq),
                apply,
            )
    return changed


def main() -> int:
    args = parse_args()
    uploads_dir = Path(args.uploads_dir).resolve()
    if not uploads_dir.exists():
        raise SystemExit(f"Uploads directory not found: {uploads_dir}")

    conn = connect(args.db_url)
    conn.autocommit = False
    plans: dict[str, MovePlan] = {}

    try:
        with conn.cursor() as cur:
            counts = {
                "assets": migrate_assets(cur, uploads_dir, plans, args.apply, args.limit),
                "asset_versions": migrate_asset_versions(cur, uploads_dir, plans, args.apply, args.limit),
                "asset_subtitle_cues": migrate_subtitle_cues(cur, uploads_dir, plans, args.apply, args.limit),
                "asset_ocr_segments": migrate_ocr_segments(cur, uploads_dir, plans, args.apply, args.limit),
            }
            move_files(plans, args.apply, args.overwrite)
        if args.apply:
            conn.commit()
        else:
            conn.rollback()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    existing = sum(1 for item in plans.values() if item.exists)
    moved = sum(1 for item in plans.values() if item.moved)
    missing = sum(1 for item in plans.values() if not item.exists)
    print(json.dumps({
        "apply": bool(args.apply),
        "uploadsDir": str(uploads_dir),
        "dbRowsChanged": counts,
        "fileMovesPlanned": len(plans),
        "fileMovesExisting": existing,
        "fileMovesMissing": missing,
        "fileMovesMoved": moved,
        "sampleMoves": [
            {"from": p.old_url, "to": p.new_url, "exists": p.exists}
            for p in list(plans.values())[:20]
        ],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
