# id backend — decisions record

Decisions made while building the 0.3.0 id backend, recorded here because they
were made autonomously (no follow-up available). Revisit freely.

## Framing: what "idml supports id, no TS/JS/npm" means

idml already had a native-app prototype in `id_development/nativeapp` that
renders `todo.idml` as a real window in pure `id` — **but** it produced two
committed `.gen.id` files with **Node** scripts (`scripts/regen.sh` →
`build-scene.mjs`, `build-font.mjs`). `build-scene.mjs` imports idml's
**TypeScript** `parseIdml` to turn `.idml` into pixel geometry. That import is
the TS/JS/npm "in the loop."

So the 0.3.0 target was concrete: **do idml's parse + layout in `id` instead of
TypeScript.** That is what this backend is. It lives in the idml package (not
nativeapp) because it is the reusable "id backend," the id-native counterpart to
`src/` (the TS/React backend).

## Codegen vs. runtime → runtime (parse+render live)

`build-scene.mjs` pre-*compiles* `.idml` to `layout.gen.id`. I chose instead to
**parse and render at runtime**: the tool reads an `.idml` on stdin and draws it
directly. Reasons: it is a smaller, self-contained artifact; it proves the whole
pipeline (not just codegen); and it is verifiable headlessly (PPM out). Emitting
`layout.gen.id` is kept as a roadmap item (README) — it is a one-mode addition
on top of the same resolver.

## Headless PPM, not a window

Rendering to a **software framebuffer + PPM dump** (not the gfx window backend)
was deliberate: the window backend links native X11/OpenGL, which needs headers
that aren't on NixOS's default path (the build here hit exactly that). The
framebuffer/PPM path is pure `id` + `cc` — it builds and runs anywhere, needs no
display, and is byte-inspectable for verification. The window path stays
available for the interactive app; it is not needed to *prove* the backend.

## Fused parse+layout, no stored AST

id favours small functions and shared mutable state via list reference-semantics
(scalars are write-once). Rather than build an AST in parallel lists and walk it,
the recursive-descent parser **computes each node's pixel rect as it parses**,
passing the parent rect down. Simpler, and it sidesteps id's write-once scalars.
The one shared mutable is the parse cursor (a 1-cell `int[]`) and a 3-cell header
scratch; both are read immediately, before recursion reuses them (the gotcha:
capture a child's `cw`/`ch` as **locals** before recursing, since recursion
clobbers the shared header — see `parse/kids.id`).

## Build with `bin/idc`, keep the code-level rules

`id_development/nativeapp/id` itself uses >3 entries in a directory and builds
with `bin/idc` (only the reference `idc.py` enforces the ≤3-entries-per-directory
rule). I followed nativeapp's own convention: build with `bin/idc`, and keep the
rules that shape the code — **≤3 functions/file, ≤3 actions/block, ≤2 nesting** —
which the whole `src/` tree obeys. The lexer (`src/lex`) additionally compiles
clean under the strict `idc.py`.

## Rounding

Percentages resolve with round-to-nearest (`(v*pct+50)/100`) to match
`build-scene.mjs`'s `Math.round`, so the two resolvers agree to the pixel on
`todo.idml` (floor-division drifted 1–3 px on nested boxes).

## Done after the first cut (still 0.3.0)

Colours-from-`define`, `define`-aware direction, and text rendering — first
deferred to land a working core — are now implemented and verified (a real
palette from the `define` block, direction from each node's base kind, and an
8×8 bitmap-font label per node). The `examples/stress-test.idml` diagnostic
exercises all of them and `verify.sh` asserts the result pixel-by-pixel.

During this the whole `src/` tree was restructured into a strict rule-of-3
directory tree so it builds under **both** `bin/idc` and the reference `idc.py`
(the trigger: the font pushed `bin/idc` to fall back to `idc.py`, which enforces
the ≤3-entries/dir rule the flat tree violated). Because id resolves calls
globally, that was a pure file move — and `idc.py`'s type checker then caught two
real bugs `bin/idc` had accepted (reusing the int-typed `lset`/param names for a
`string[]`), now fixed with a separate `lset_s`.

## Scope still held for later

**Data bindings** (`@ref`/`~model`/handlers) are parsed but not resolved — no
app data source, so binding-only nodes draw no text. **Emitting `layout.gen.id`**
(to delete `build-scene.mjs`) is the one remaining roadmap step. **Tailwind class
references** stay out of scope per the 0.3.0 request (a styling-wrapper syntax
will replace them later). Hex colours are lowercase/decimal-only.
