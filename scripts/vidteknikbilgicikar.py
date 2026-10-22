#!/usr/bin/env python3
"""Precompute missing per-asset/per-version ffprobe metadata in PostgreSQL.

Run from inside the application container. Dry-run is the default; pass --apply
to persist only entries whose file fingerprint is missing or has changed.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from fractions import Fraction
from pathlib import Path
from typing import Any
from urllib.parse import quote


VIDEO_EXTENSIONS = {
    ".3g2", ".3gp", ".avi", ".m2ts", ".m4v", ".mkv", ".mov", ".mp4",
    ".mpeg", ".mpg", ".mts", ".webm", ".wmv",
}


def load_pg_driver():
    try:
        import psycopg  # type: ignore
        return psycopg
    except ImportError:
        try:
            import psycopg2  # type: ignore
            return psycopg2
        except ImportError as exc:
            raise SystemExit("PostgreSQL driver missing. Build the updated app image first.") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fill missing video technical metadata using ffprobe.")
    parser.add_argument("--db-url", default="", help="Optional PostgreSQL URL; otherwise use the app's environment/secret settings.")
    parser.add_argument("--uploads-dir", default=os.getenv("UPLOADS_DIR", "/app/uploads"))
    parser.add_argument("--asset-id", help="Process one asset only.")
    parser.add_argument("--limit", type=int, default=0, help="Limit assets (0 means all).")
    parser.add_argument("--apply", action="store_true", help="Save results; without this flag the run is dry-run.")
    parser.add_argument("--verbose", action="store_true", help="Print each asset/version processed.")
    return parser.parse_args()


def read_secret_file(env_name: str) -> str:
    direct = os.getenv(env_name, "").strip()
    if direct:
        return direct
    file_path = os.getenv(f"{env_name}_FILE", "").strip()
    if not file_path:
        return ""
    try:
        return Path(file_path).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def database_url(explicit_url: str = "") -> str:
    if explicit_url.strip():
        return explicit_url.strip()
    configured_url = read_secret_file("DATABASE_URL")
    if configured_url:
        return configured_url
    password = read_secret_file("MAM_DB_PASSWORD")
    if not password:
        return ""
    user = os.getenv("MAM_DB_USER") or os.getenv("POSTGRES_USER") or "postgres"
    host = os.getenv("MAM_DB_HOST") or "localhost"
    port = os.getenv("MAM_DB_PORT") or "5432"
    database = os.getenv("MAM_DB_NAME") or os.getenv("POSTGRES_DB") or "mam_mvp"
    return f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}@{host}:{port}/{quote(database, safe='')}"


def as_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError):
            return {}
    return {}


def absolute_media_path(value: str, uploads_dir: str, default_subdir: str = "") -> str:
    raw = str(value or "").strip().split("?", 1)[0]
    if not raw:
        return ""
    if raw.startswith("/uploads/"):
        return str(Path(uploads_dir, raw[len("/uploads/"):]))
    if raw.startswith("uploads/"):
        return str(Path(uploads_dir, raw[len("uploads/"):]))
    if os.path.isabs(raw):
        return raw
    candidates = []
    if default_subdir:
        candidates.append(Path(uploads_dir, default_subdir, raw))
    candidates.append(Path(uploads_dir, raw))
    return str(next((item for item in candidates if item.is_file()), candidates[0]))


def file_fingerprint(file_path: str) -> str:
    if not file_path:
        return ""
    result = subprocess.run(
        ["node", "-e", "const fs=require('fs'),p=require('path').resolve(process.argv[1]);const s=fs.statSync(p);if(!s.isFile())process.exit(2);process.stdout.write(`${p}\\x1f${s.size}\\x1f${s.mtimeMs}`)", file_path],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout if result.returncode == 0 else ""


def numeric(value: Any, default: float = 0) -> float:
    try:
        parsed = float(value)
        return max(0, parsed) if parsed == parsed else default
    except (TypeError, ValueError):
        return default


def frame_rate(video: dict[str, Any] | None) -> float:
    if not video:
        return 0
    for key in ("avg_frame_rate", "r_frame_rate"):
        try:
            rate = float(Fraction(str(video.get(key) or "0/0")))
            if rate > 0:
                return rate
        except (ValueError, ZeroDivisionError, TypeError):
            continue
    return 0


def probe_media(file_path: str) -> dict[str, Any]:
    if not file_path or not Path(file_path).is_file():
        return {"available": False}
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-count_frames", "-show_format", "-show_streams", file_path],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return {"available": False}
    try:
        parsed = json.loads(result.stdout or "{}")
    except ValueError:
        return {"available": False}
    fmt = parsed.get("format") if isinstance(parsed.get("format"), dict) else {}
    streams = parsed.get("streams") if isinstance(parsed.get("streams"), list) else []
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    primary_audio = audio_streams[0] if audio_streams else None
    frame_count = 0
    if video:
        frame_count = numeric(video.get("nb_read_frames")) or numeric(video.get("nb_frames"))
    return {
        "available": True,
        "container": [part for part in str(fmt.get("format_name") or "").split(",") if part],
        "durationSeconds": numeric(fmt.get("duration")),
        "bitRate": numeric(fmt.get("bit_rate")),
        "fileSize": numeric(fmt.get("size")),
        "video": ({
            "codec": str(video.get("codec_name") or "").strip(),
            "profile": str(video.get("profile") or "").strip(),
            "width": numeric(video.get("width")),
            "height": numeric(video.get("height")),
            "pixelFormat": str(video.get("pix_fmt") or "").strip(),
            "frameRate": frame_rate(video),
            "frameCount": frame_count,
        } if video else None),
        "audio": {
            "streamCount": len(audio_streams),
            "codecs": sorted({str(s.get("codec_name") or "").strip() for s in audio_streams if str(s.get("codec_name") or "").strip()}),
            "channels": numeric(primary_audio.get("channels")) if primary_audio else 0,
            "sampleRate": numeric(primary_audio.get("sample_rate")) if primary_audio else 0,
        },
    }


def cache_is_valid(entry: Any, fingerprint: str) -> bool:
    cached = entry if isinstance(entry, dict) else {}
    payload = cached.get("payload") if isinstance(cached.get("payload"), dict) else {}
    return cached.get("fingerprint", "") == fingerprint and (bool(payload.get("available")) or not fingerprint)


def cache_entry(file_path: str, existing: Any) -> tuple[dict[str, Any], bool]:
    fingerprint = file_fingerprint(file_path)
    current = existing if isinstance(existing, dict) else {}
    if cache_is_valid(current, fingerprint):
        return current, False
    return {"fingerprint": fingerprint, "payload": probe_media(file_path)}, True


def main() -> int:
    args = parse_args()
    db_url = database_url(args.db_url)
    if not db_url:
        print("Database settings are missing. Set DATABASE_URL or MAM_DB_PASSWORD / MAM_DB_PASSWORD_FILE.", file=sys.stderr)
        return 2
    uploads_dir = str(Path(args.uploads_dir).resolve())
    driver = load_pg_driver()
    conn = driver.connect(db_url)
    processed = 0
    changed = 0
    skipped = 0
    failures = 0
    try:
        with conn.cursor() as cur:
            query = """
                SELECT id, source_path, media_url, proxy_url, default_version_id,
                       duration_seconds, file_name, mime_type, type, dc_metadata
                FROM assets
                WHERE (LOWER(COALESCE(mime_type, '')) LIKE 'video/%'
                       OR LOWER(COALESCE(type, '')) = 'video'
                       OR LOWER(COALESCE(file_name, '')) ~ '\\.(3g2|3gp|avi|m2ts|m4v|mkv|mov|mp4|mpeg|mpg|mts|webm|wmv)$')
            """
            params: list[Any] = []
            if args.asset_id:
                query += " AND id = %s"
                params.append(args.asset_id)
            query += " ORDER BY created_at, id"
            if args.limit > 0:
                query += " LIMIT %s"
                params.append(args.limit)
            cur.execute(query, params)
            assets = cur.fetchall()

            for row in assets:
                (asset_id, source_path, media_url, proxy_url, default_version_id,
                 _duration, file_name, mime_type, _asset_type, dc_value) = row
                if not str(mime_type or "").lower().startswith("video/") and Path(str(file_name or "")).suffix.lower() not in VIDEO_EXTENSIONS:
                    skipped += 1
                    continue
                dc = as_object(dc_value)
                technical = as_object(dc.get("mediaTechnicalInfo"))
                source = str(source_path or "").strip()
                if not Path(source).is_file():
                    source = absolute_media_path(str(media_url or ""), uploads_dir)
                if not Path(source).is_file():
                    source = ""
                proxy = absolute_media_path(str(proxy_url or ""), uploads_dir, "proxies")
                if not Path(proxy).is_file():
                    proxy = ""
                original_entry, original_changed = cache_entry(source, technical.get("original"))
                proxy_entry, proxy_changed = cache_entry(proxy, technical.get("proxy"))
                for file_path, entry in ((source, original_entry), (proxy, proxy_entry)):
                    if file_path and Path(file_path).is_file() and not entry.get("payload", {}).get("available"):
                        failures += 1
                if original_changed or proxy_changed:
                    technical["original"] = original_entry
                    technical["proxy"] = proxy_entry
                    changed += 1

                cur.execute(
                    """SELECT version_id, snapshot_source_path, snapshot_media_url,
                              snapshot_mime_type, snapshot_file_name, action_type
                       FROM asset_versions WHERE asset_id = %s AND action_type <> 'attachment'
                       ORDER BY created_at, version_id""",
                    (asset_id,),
                )
                version_rows = cur.fetchall()
                versions_info = as_object(technical.get("versions"))
                version_changed = False
                default_duration = None
                for (version_id, snapshot_source_path, snapshot_media_url,
                     snapshot_mime_type, snapshot_file_name, action_type) in version_rows:
                    version_mime = str(snapshot_mime_type or "").lower()
                    if not version_mime.startswith("video/") and Path(str(snapshot_file_name or "")).suffix.lower() not in VIDEO_EXTENSIONS:
                        continue
                    source_candidate = str(snapshot_source_path or "").strip()
                    if not Path(source_candidate).is_file():
                        source_candidate = absolute_media_path(str(snapshot_media_url or media_url or ""), uploads_dir)
                    if not Path(source_candidate).is_file():
                        source_candidate = source
                    if not Path(source_candidate).is_file():
                        source_candidate = ""
                    is_original = bool(source_candidate and source and Path(source_candidate).resolve() == Path(source).resolve())
                    proxy_candidate = proxy if is_original else absolute_media_path(str(snapshot_media_url or ""), uploads_dir, "proxies")
                    if not Path(proxy_candidate).is_file():
                        proxy_candidate = ""
                    current = as_object(versions_info.get(str(version_id)))
                    original_cached, original_version_changed = cache_entry(source_candidate, current.get("original"))
                    proxy_cached, proxy_version_changed = cache_entry(proxy_candidate, current.get("proxy"))
                    for file_path, entry in ((source_candidate, original_cached), (proxy_candidate, proxy_cached)):
                        if file_path and Path(file_path).is_file() and not entry.get("payload", {}).get("available"):
                            failures += 1
                    if original_version_changed or proxy_version_changed:
                        versions_info[str(version_id)] = {"original": original_cached, "proxy": proxy_cached}
                        version_changed = True
                    if str(version_id) == str(default_version_id or "") and original_cached.get("payload", {}).get("available"):
                        default_duration = numeric(original_cached["payload"].get("durationSeconds"))
                    if args.verbose:
                        state = "cached" if not (original_version_changed or proxy_version_changed) else "probed"
                        print(f"{asset_id} v:{version_id} {state}")

                if version_changed:
                    technical["versions"] = versions_info
                    changed += 1
                if not (original_changed or proxy_changed or version_changed):
                    skipped += 1
                if default_duration and args.apply:
                    cur.execute(
                        "UPDATE assets SET duration_seconds = %s WHERE id = %s AND default_version_id = %s",
                        (default_duration, asset_id, default_version_id),
                    )
                if args.apply and (original_changed or proxy_changed or version_changed):
                    dc["mediaTechnicalInfo"] = technical
                    cur.execute(
                        "UPDATE assets SET dc_metadata = jsonb_set(COALESCE(dc_metadata, '{}'::jsonb), '{mediaTechnicalInfo}', %s::jsonb, true) WHERE id = %s",
                        (json.dumps(technical, ensure_ascii=False), asset_id),
                    )
                    conn.commit()
                elif not args.apply:
                    conn.rollback()
                processed += 1
                if args.verbose:
                    print(f"asset {asset_id}: {'updated' if original_changed or proxy_changed or version_changed else 'current'}")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"{mode}: assets checked={processed}, cache entries needing update={changed}, unchanged/skipped={skipped}, failures={failures}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
