#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: scripts/package-release.sh <source_dir> [output_zip]" >&2
  exit 1
fi

SOURCE_DIR="$1"
OUTPUT_ZIP="${2:-releases/$(basename "${SOURCE_DIR%/}").zip}"

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Source directory not found: ${SOURCE_DIR}" >&2
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT_ZIP}")"

python3 - "${SOURCE_DIR}" "${OUTPUT_ZIP}" <<'PY'
import pathlib
import sys
import zipfile

source = pathlib.Path(sys.argv[1]).resolve()
output = pathlib.Path(sys.argv[2]).resolve()

with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for path in source.rglob("*"):
        if path.is_dir():
            continue
        zf.write(path, arcname=str(path.relative_to(source)))

print(output)
PY
