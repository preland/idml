#!/usr/bin/env bash
# Build the pure-`id` idml backend with ONLY the id compiler -- no Node, no npm,
# no TypeScript. Produces ./idml-id, a native binary that reads an .idml document
# on stdin and renders it (see README.md).
#
#   ID_REPO=~/git/id_development ./build.sh
#
# ID_REPO must point at a checkout of the `id` language (it provides bin/idc, the
# compiler). Defaults to ~/git/id_development.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ID_REPO="${ID_REPO:-$HOME/git/id_development}"
IDC="$ID_REPO/bin/idc"

if [[ ! -x "$IDC" ]]; then
  echo "error: id compiler not found at $IDC" >&2
  echo "       set ID_REPO to your id_development checkout." >&2
  exit 1
fi

exec "$IDC" "$HERE/src" -o "$HERE/idml-id"
