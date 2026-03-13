#!/usr/bin/env bash
# Upload game build binary files to GCS.
#
# Usage:
#   ./scripts/upload-game-build.sh <build-dir> <game-slug> <version>
#
# Example:
#   ./scripts/upload-game-build.sh games/inga/play/build inga-demo 0.1.5
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - GCS bucket "randaworks-game-builds" exists

set -euo pipefail

BUCKET="randaworks-game-builds"

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <build-dir> <game-slug> <version>"
  echo "Example: $0 games/inga/play/build inga-demo 0.1.5"
  exit 1
fi

BUILD_DIR="$1"
GAME_SLUG="$2"
VERSION="$3"
GCS_PATH="gs://${BUCKET}/${GAME_SLUG}/${VERSION}"

if [[ ! -d "$BUILD_DIR" ]]; then
  echo "Error: Build directory '$BUILD_DIR' does not exist."
  exit 1
fi

# Files to upload (large binaries not stored in git)
UPLOAD_FILES=()
for f in "$BUILD_DIR"/*.pck.part* "$BUILD_DIR"/*.wasm; do
  if [[ -f "$f" ]]; then
    UPLOAD_FILES+=("$f")
  fi
done

if [[ ${#UPLOAD_FILES[@]} -eq 0 ]]; then
  echo "Error: No .pck.part* or .wasm files found in '$BUILD_DIR'."
  exit 1
fi

echo "=== Upload Game Build to GCS ==="
echo "Build dir:  $BUILD_DIR"
echo "Game slug:  $GAME_SLUG"
echo "Version:    $VERSION"
echo "GCS path:   $GCS_PATH"
echo "Files to upload:"
for f in "${UPLOAD_FILES[@]}"; do
  size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo "?")
  echo "  $(basename "$f")  ($size bytes)"
done
echo ""
read -rp "Proceed? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

for f in "${UPLOAD_FILES[@]}"; do
  name=$(basename "$f")
  # Set Content-Type based on extension
  if [[ "$name" == *.wasm ]]; then
    content_type="application/wasm"
  else
    content_type="application/octet-stream"
  fi

  # Large binary files: cache for 1 year (immutable content, versioned by path)
  echo "Uploading $name -> ${GCS_PATH}/${name} ..."
  gcloud storage cp "$f" "${GCS_PATH}/${name}" \
    --content-type="$content_type" \
    --cache-control="public, max-age=31536000, immutable"
done

echo ""
echo "=== Upload Complete ==="
echo ""
echo "Verify with:"
echo "  curl -I https://storage.googleapis.com/${BUCKET}/${GAME_SLUG}/${VERSION}/index.pck.part000"
echo ""
echo "Update GCS_BASE_URL in index.pck.loader.js if version changed:"
echo "  const GCS_BASE_URL = 'https://storage.googleapis.com/${BUCKET}/${GAME_SLUG}/${VERSION}/';"
