# idml backends

idml is a **backend-agnostic UI spec**. The `.idml` language is the contract;
each *backend* is an independent implementation that turns an `.idml` document
into a running UI for some target. Backends do not depend on one another.

| backend | location | target | ships to npm |
| --- | --- | --- | --- |
| **default (TypeScript/React)** | [`../src`](../src) | a React/Next component tree | yes (`dist/`) |
| **id** | [`id/`](id) | native pixels (software framebuffer) in pure [`id`](https://github.com/preland/id) | no (repo-only, built by the id compiler) |

The default backend lives at `src/` because it *is* the published npm package
(`idml-ui`). Additional backends live under `backends/<name>/`.

## Isolation guarantees (why adding a backend is safe)

Adding a backend — say `backends/c/` for C bindings — is **purely additive**. It
cannot conflict with or regress an existing backend, because there is no shared
mutable code or data between backends:

- **No cross-imports.** `src/` has no reference to `backends/`, and `backends/id`
  has no reference to `src/` (it reads and parses `.idml` itself). A new backend
  imports neither.
- **No backend registry.** Nothing enumerates the backends — not `package.json`,
  not the build config, not `src/`. There is no central list a new backend must
  edit (and therefore none it can break).
- **The npm tarball is unaffected.** `package.json`'s `files` is `["dist",
  "ui.config.schema.json"]` — only the default backend's build. Adding
  `backends/c/` changes nothing about what publishes.
- **Each backend owns its fixtures.** The default backend's example/test `.idml`
  files live at the repo root + `__tests__`; the id backend's live in
  `backends/id/examples/`. Nothing is a shared fixture, so no backend edits a
  file another depends on.
- **Each backend owns its build + verification.** The default backend uses
  `tsup` + `vitest`; the id backend uses `build.sh` + `verify.sh` (the id
  compiler). A new backend brings its own — it does not touch the others'.

So: to add C bindings, create `backends/c/` with its own parser, resolver,
renderer, examples, and build/verify script. You would modify **no shared data**
and touch **no other backend**.

## The one thing that is shared — the language, not code

The single shared thing is the `.idml` **language** itself, and it is a
*contract*, not a mutable artifact: a backend reads it, it doesn't write it.
Today each backend implements the grammar independently (the default backend in
`src/parser/idml-parser.ts`; the id backend across `backends/id/src` — and the id
backend deliberately supports a documented subset). That independence is what
makes the backends non-conflicting, but it means there is **no single
source-of-truth grammar** and backends can drift.

**Recommended future work (not required to add a backend):** a language-neutral
**conformance corpus** — a set of `.idml` inputs with expected resolved
geometry — that every backend is checked against. `backends/id/verify.sh` already
does this shape for one backend (assert resolved rects + rendered pixels); lifting
those cases to a shared, backend-independent fixtures set would let each backend
(default, id, a future C one) prove it implements the same language. Until then,
the grammar's practical references are the two existing parsers.

## Adding a backend — checklist

1. Create `backends/<name>/` — self-contained.
2. Implement: read `.idml` → parse → resolve exact-fill layout → render for your
   target. (See `backends/id/` for a worked example: lex → recursive-descent
   parse with layout fused in → framebuffer.)
3. Add `examples/` and a `verify.sh` (or equivalent) that checks a known input
   against known output, headlessly if possible.
4. Do **not** edit `src/`, other backends, `package.json`, or the build config.
5. Document your supported subset and decisions (see `backends/id/README.md` +
   `DECISIONS.md`).
