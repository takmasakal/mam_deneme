#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

MODEL="${1:-marian}"
SERVICE="${MAM_APP_SERVICE:-app}"
MARIAN_MODEL_DIR="${MAM_MARIAN_MODEL_DIR:-/opt/mam-models/marian/opus-mt-tc-big-en-tr}"

run_in_app() {
  docker compose exec "${SERVICE}" sh -lc "$1"
}

require_torch_26_for_marian() {
  run_in_app 'python3 - <<'"'"'PY'"'"'
import re
import sys

try:
    import torch
except Exception as exc:
    print(f"ERROR: PyTorch is not available in the app container: {exc}", file=sys.stderr)
    sys.exit(1)

version = str(torch.__version__)
match = re.match(r"^(\d+)\.(\d+)", version)
major, minor = (int(match.group(1)), int(match.group(2))) if match else (0, 0)
if (major, minor) < (2, 6):
    print(
        "ERROR: Marian subtitle translation model preparation requires torch>=2.6. "
        f"Current app container has torch {version}. Rebuild the runtime image with ./deploy/build-runtime.sh, "
        "then run docker compose up -d --build app and retry ./deploy/prepare-models.sh marian.",
        file=sys.stderr,
    )
    sys.exit(42)

print(f"PyTorch version OK for Marian model preparation: {version}")
PY'
}

usage() {
  cat <<'EOF'
Usage:
  ./deploy/prepare-models.sh marian
  ./deploy/prepare-models.sh whisper
  ./deploy/prepare-models.sh paddle
  ./deploy/prepare-models.sh all

Environment:
  MAM_APP_SERVICE=app
  MAM_MARIAN_MODEL_DIR=/opt/mam-models/marian/opus-mt-tc-big-en-tr
  WHISPER_MODEL=small
EOF
}

case "${MODEL}" in
  marian|subtitle-translation)
    require_torch_26_for_marian
    run_in_app "HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 python3 scripts/prepare_offline_models.py --skip-whisper --skip-paddle-ocr --marian-model --marian-model-dir '${MARIAN_MODEL_DIR}'"
    ;;
  whisper)
    run_in_app "HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 python3 scripts/prepare_offline_models.py --whisper-model '${WHISPER_MODEL:-small}' --skip-paddle-ocr"
    ;;
  paddle|ocr)
    run_in_app "HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 python3 scripts/prepare_offline_models.py --skip-whisper --paddle-ocr"
    ;;
  all)
    require_torch_26_for_marian
    run_in_app "HF_HUB_OFFLINE=0 TRANSFORMERS_OFFLINE=0 python3 scripts/prepare_offline_models.py --whisper-model '${WHISPER_MODEL:-small}' --paddle-ocr --marian-model --marian-model-dir '${MARIAN_MODEL_DIR}'"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown model group: ${MODEL}" >&2
    usage >&2
    exit 1
    ;;
esac
