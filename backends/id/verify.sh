#!/usr/bin/env bash
# Build the id backend and verify it end-to-end WITHOUT a display: resolved
# geometry, a full todo render, and the stress test checked pixel-by-pixel.
# Pure id -- no browser, no JS.
#
# The three documents are emitted below rather than read from disk: the repo
# gitignores *.idml, so any fixture kept as a file is one a fresh clone does not
# have, and the assertions here are tied to these exact documents anyway.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HERE/idml-id"

doc_demo() {
cat <<'IDML'
./
Col()[100,100,top-left] {
  Row()[30,100,top-left] {
    Col()[100,40,top-left]{}
    Col()[100,60,top-left]{}
  }
  Col()[70,100,top-left]{}
}
IDML
}

doc_todo() {
cat <<'IDML'
# The native app's UI, expressed in idml. The `slot-*` class hooks tag the nodes
# a compiler must locate (card, badge, input, add button, list area, title);
# their bg/fg become the palette. Bindings (@remaining, ~newtodo, addTodo) are
# parsed but not resolved here -- they document the contract, not behaviour.

Page:Col `slot-page` {
  bg: #eef1f6
}

Card:Col `slot-card` {
  bg: #ffffff
}

Title:Text `slot-title` {
  fg: #0f172a
}

Badge:Row `slot-badge` {
  bg: #eef2ff
}

BadgeNum:Text `slot-badgenum` {
  fg: #4338ca
}

Field:Input `slot-input` {
  bg: #f1f5f9
}

AddBtn:Button `slot-add` {
  bg: #6366f1
}

List:Col `slot-list` {
  bg: #ffffff
}

./
Page()[100,100,top-left] {
  Row()[100,100,top-left] {
    Spacer()[100,14,top-left]{}
    Col()[100,72,top-left] {
      Spacer()[9,100,top-left]{}
      Card()[82,100,top-left] {
        Row()[15,100,center-left] {
          Title("id . todo")[100,56,center-left]{}
          Spacer()[100,18,top-left]{}
          Badge()[100,26,center-right] {
            BadgeNum(@remaining)[100,100,center]{}
          }
        }
        Spacer()[5,100,top-left]{}
        Row()[12,100,center-left] {
          Field(~newtodo)[100,74,center-left]{}
          Spacer()[100,4,top-left]{}
          AddBtn("Add", addTodo)[100,22,center]{}
        }
        Spacer()[5,100,top-left]{}
        List()[63,100,top-left]{}
      }
      Spacer()[9,100,top-left]{}
    }
    Spacer()[100,14,top-left]{}
  }
}
IDML
}

doc_stress() {
cat <<'IDML'
# A self-verifying diagnostic: it renders correctly ONLY if every feature works,
# and each region targets one.
#
#   * TITLE   : text rendering + a define's fg colour
#   * SWATCHES: a Row of 4 equal cells -> horizontal tiling + 4 parsed bg colours
#               + labels. If direction is wrong they stack; if colour parsing is
#               wrong the R/G/B/amber bar is wrong.
#   * GRID    : a Row of two Cols, each split into two -> a dark/light CHECKERBOARD
#               (A,B / C,D). Only correct if Row-vs-Col nesting alternates right.
#   * BARS    : a Row split 10/20/30/40 -> a left-to-right STAIRCASE. Only correct
#               if exact-fill percentage widths resolve to the right pixels.
#
# A broken/half-built backend shows stacked swatches, a scrambled checkerboard,
# equal-width bars, missing text, or wrong colours -- all obvious at a glance.

Page:Col `p`     { bg: #202430 }
Card:Col `c`     { bg: #ffffff }
Title:Text `ti`  { fg: #4338ca }

# swatch cells: distinct bg + a readable label colour
Swatches:Row `sw` { }
CRed:Col `cr`    { bg: #e11d48  fg: #ffffff }
CAmber:Col `ca`  { bg: #f59e0b  fg: #1f2937 }
CGreen:Col `cg`  { bg: #10b981  fg: #06281d }
CBlue:Col `cb`   { bg: #3b82f6  fg: #ffffff }

# checkerboard: QDark and QLight alternate across two columns
Grid:Row `gr`    { }
GcolL:Col `gl`   { }
GcolR:Col `gt`   { }
QDark:Col `qd`   { bg: #111827  fg: #ffffff }
QLight:Col `ql`  { bg: #e5e7eb  fg: #111827 }

# staircase bars: four widths 10/20/30/40
Bars:Row `ba`    { }
B1:Col `b1`      { bg: #f472b6 }
B2:Col `b2`      { bg: #c084fc }
B3:Col `b3`      { bg: #60a5fa }
B4:Col `b4`      { bg: #34d399 }

./
Page()[100,100,top-left] {
  Row()[100,100,top-left] {
    Spacer()[100,8,top-left]{}
    Card()[100,84,top-left] {
      Title("idml . id backend")[16,100,top-left]{}
      Swatches()[28,100,top-left] {
        CRed("red")[100,25,top-left]{}
        CAmber("amber")[100,25,top-left]{}
        CGreen("green")[100,25,top-left]{}
        CBlue("blue")[100,25,top-left]{}
      }
      Grid()[28,100,top-left] {
        GcolL()[100,50,top-left] {
          QDark("A")[50,100,top-left]{}
          QLight("B")[50,100,top-left]{}
        }
        GcolR()[100,50,top-left] {
          QLight("C")[50,100,top-left]{}
          QDark("D")[50,100,top-left]{}
        }
      }
      Bars()[28,100,top-left] {
        B1("1")[100,10,top-left]{}
        B2("2")[100,20,top-left]{}
        B3("3")[100,30,top-left]{}
        B4("4")[100,40,top-left]{}
      }
    }
    Spacer()[100,8,top-left]{}
  }
}
IDML
}

if [[ "${1:-}" == "--emit" ]]; then
  case "${2:-}" in
    demo)   doc_demo ;;
    todo)   doc_todo ;;
    stress) doc_stress ;;
    *) echo "usage: ${0##*/} --emit demo|todo|stress" >&2; exit 2 ;;
  esac
  exit 0
fi

"$HERE/build.sh"

# --- 1. exact layout geometry --------------------------------------------------
echo "== demo layout (--rects) =="
got="$(doc_demo | "$BIN" --rects)"
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
echo "== todo render (PPM) =="
doc_todo | "$BIN" > "$HERE/todo.ppm"
[[ "$(wc -l < "$HERE/todo.ppm")" == "294403" ]] || { echo "FAIL: bad PPM size" >&2; exit 1; }
echo "PASS: rendered a full 640x460 frame in pure id"

# --- 3. the stress test, checked pixel-by-pixel --------------------------------
# A correct build renders a specific diagnostic; assert key pixels so a broken
# backend (wrong layout / direction / colour / missing text) fails here.
echo
echo "== stress test (pixel assertions) =="
doc_stress | "$BIN" > "$HERE/stress.ppm"

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
