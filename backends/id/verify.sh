#!/usr/bin/env bash
# Build the id backend and verify it end-to-end WITHOUT a display: resolve the
# example layouts and check the pixel geometry, then render todo.idml to a PPM.
# Pure id -- no browser, no JS.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HERE/idml-id"

"$HERE/build.sh"

echo "== demo.idml layout (--rects) =="
got="$(cat "$HERE/examples/demo.idml" | "$BIN" --rects)"
echo "$got"
want="0 0 640 460
0 0 640 138
0 0 256 138
256 0 384 138
0 138 640 322"
if [[ "$got" == "$want" ]]; then
  echo "PASS: demo layout matches expected exact-fill geometry"
else
  echo "FAIL: demo layout mismatch" >&2; exit 1
fi

echo
echo "== todo.idml render (PPM) =="
cat "$HERE/examples/todo.idml" | "$BIN" > "$HERE/todo.ppm"
lines="$(wc -l < "$HERE/todo.ppm")"
colors="$(tail -n +4 "$HERE/todo.ppm" | sort -u | wc -l)"
echo "wrote todo.ppm: $lines lines (expect 294403), $colors distinct colours"
[[ "$lines" == "294403" ]] || { echo "FAIL: unexpected PPM size" >&2; exit 1; }
echo "PASS: rendered a full 640x460 frame in pure id"
echo
echo "convert to PNG with:  magick $HERE/todo.ppm todo.png"
