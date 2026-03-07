#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rm -rf "$ROOT_DIR/public"
mkdir -p "$ROOT_DIR/public"

copy_file() {
  local src="$1"
  local dest="$2"
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
}

copy_file "$ROOT_DIR/index.html" "$ROOT_DIR/public/index.html"
copy_file "$ROOT_DIR/library.html" "$ROOT_DIR/public/library.html"
copy_file "$ROOT_DIR/stack-builder.html" "$ROOT_DIR/public/stack-builder.html"
copy_file "$ROOT_DIR/biohacker-protocol.html" "$ROOT_DIR/public/biohacker-protocol.html"
copy_file "$ROOT_DIR/food-longevity.html" "$ROOT_DIR/public/food-longevity.html"
copy_file "$ROOT_DIR/pricing.html" "$ROOT_DIR/public/pricing.html"
copy_file "$ROOT_DIR/privacy.html" "$ROOT_DIR/public/privacy.html"
copy_file "$ROOT_DIR/terms.html" "$ROOT_DIR/public/terms.html"
copy_file "$ROOT_DIR/sitemap.xml" "$ROOT_DIR/public/sitemap.xml"

if [ -d "$ROOT_DIR/data" ]; then
  mkdir -p "$ROOT_DIR/public/data"
  cp -R "$ROOT_DIR/data/." "$ROOT_DIR/public/data/"
fi

if [ -d "$ROOT_DIR/molecule_pages" ]; then
  mkdir -p "$ROOT_DIR/public/molecule_pages"
  cp -R "$ROOT_DIR/molecule_pages/." "$ROOT_DIR/public/molecule_pages/"
fi

echo "public sync complete"
