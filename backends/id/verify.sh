#!/usr/bin/env bash
# Build the id backend and verify it end-to-end WITHOUT a display: resolved
# geometry, a full todo.idml render, and the stress test checked pixel-by-pixel.
# Pure id -- no browser, no JS.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HERE/idml-id"

"$HERE/build.sh"

# --- 1. exact layout geometry --------------------------------------------------
echo "== demo.idml layout (--rects) =="
got="$(cat "$HERE/examples/demo.idml" | "$BIN" --rects)"
want="0 0 640 460
0 0 640 138
0 0 256 138
256 0 384 138
0 138 640 322"
if [[ "$got" == "$want" ]]; then
  echo "PASS: demo layout matches expected exact-fill geometry"
else
  echo "FAIL: demo layout mismatch"; echo "$got" >&2; exit 1
fi

# --- 2. a full render ----------------------------------------------------------
echo
echo "== todo.idml render (PPM) =="
cat "$HERE/examples/todo.idml" | "$BIN" > "$HERE/todo.ppm"
[[ "$(wc -l < "$HERE/todo.ppm")" == "294403" ]] || { echo "FAIL: bad PPM size" >&2; exit 1; }
echo "PASS: rendered a full 640x460 frame in pure id"

# --- 3. the stress test, checked pixel-by-pixel --------------------------------
# A correct build renders a specific diagnostic; assert key pixels so a broken
# backend (wrong layout / direction / colour / missing text) fails here.
echo
echo "== stress-test.idml (pixel assertions) =="
cat "$HERE/examples/stress-test.idml" | "$BIN" > "$HERE/stress.ppm"

# px X Y -> "r g b" for the pixel at (X,Y) in a 640-wide P3 PPM (3 header lines).
px() { sed -n "$(( $2 * 640 + $1 + 4 ))p" "$HERE/stress.ppm"; }
check() { # x y expected label
  local got; got="$(px "$1" "$2")"
  if [[ "$got" == "$3" ]]; then echo "PASS: $4 = ($got)";
  else echo "FAIL: $4 at ($1,$2) expected ($3) got ($got)" >&2; exit 1; fi
}

# checkerboard quadrants: A dark, B light, C light, D dark  (Row/Col nesting)
check 185 235 "17 24 39"    "grid A dark"
check 185 300 "229 231 235" "grid B light"
check 454 235 "229 231 235" "grid C light"
check 454 300 "17 24 39"    "grid D dark"
# swatch colours (colour parsing + horizontal Row tiling)
check 118 138 "225 29 72"   "swatch red"
check 523 138 "59 130 246"  "swatch blue"
# staircase colours at the extremes (exact-fill widths 10% vs 40%)
check 78 396 "244 114 182"  "bar 1 (10%)"
check 481 396 "52 211 153"  "bar 4 (40%)"
# title text rendered: its ink colour (#4338ca) must appear (grep -c reads fully,
# so no SIGPIPE under pipefail).
ink="$(tail -n +4 "$HERE/stress.ppm" | grep -c "^67 56 202$" || true)"
if [[ "$ink" -gt 0 ]]; then
  echo "PASS: title text rendered ($ink ink #4338ca pixels)"
else
  echo "FAIL: title text not found (no #4338ca pixels)" >&2; exit 1
fi

echo
echo "ALL PASS. Convert any frame with:  magick $HERE/stress.ppm stress.png"
