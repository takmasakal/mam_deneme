#!/usr/bin/env python3
import argparse
import os
import shlex
import subprocess
import sys


def read_secret_file(path):
    if not path:
        return ""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def env_or_file(name):
    return os.environ.get(name) or read_secret_file(os.environ.get(f"{name}_FILE"))


def build_psql_env():
    env = os.environ.copy()
    env.setdefault("PGHOST", os.environ.get("MAM_DB_HOST", "localhost"))
    env.setdefault("PGPORT", os.environ.get("MAM_DB_PORT", "5432"))
    env.setdefault("PGUSER", os.environ.get("MAM_DB_USER") or os.environ.get("POSTGRES_USER") or "postgres")
    env.setdefault("PGDATABASE", os.environ.get("MAM_DB_NAME") or os.environ.get("POSTGRES_DB") or "mam_mvp")
    password = env_or_file("MAM_DB_PASSWORD") or env_or_file("POSTGRES_PASSWORD")
    if password:
        env["PGPASSWORD"] = password
    return env


def main():
    parser = argparse.ArgumentParser(description="Clear all active asset edit locks.")
    parser.add_argument("--dry-run", action="store_true", help="Show current lock count without deleting.")
    args = parser.parse_args()

    env = build_psql_env()
    query = "SELECT COUNT(*) FROM asset_edit_locks;" if args.dry_run else "DELETE FROM asset_edit_locks;"
    cmd = ["psql", "-v", "ON_ERROR_STOP=1", "-tAc", query]
    printable = " ".join(shlex.quote(part) for part in cmd)
    try:
        result = subprocess.run(cmd, env=env, check=True, text=True, capture_output=True)
    except FileNotFoundError:
        print("psql command not found. Run this script inside the app container or install PostgreSQL client tools.", file=sys.stderr)
        return 127
    except subprocess.CalledProcessError as error:
        print(f"Command failed: {printable}", file=sys.stderr)
        if error.stderr:
            print(error.stderr.strip(), file=sys.stderr)
        return error.returncode

    output = result.stdout.strip()
    if args.dry_run:
        print(f"Active asset edit locks: {output or '0'}")
    else:
        print("All asset edit locks cleared.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
