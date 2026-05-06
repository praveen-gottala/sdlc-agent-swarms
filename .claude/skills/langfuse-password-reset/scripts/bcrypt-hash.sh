#!/usr/bin/env bash
# Emit a bcrypt hash compatible with Langfuse credentials (bcryptjs / bcrypt).
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "usage: $0 <plaintext-password>" >&2
  exit 1
fi
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
cd "$tmpdir"
npm init -y >/dev/null
npm install bcryptjs@2.4.3 --silent
node -e "const b=require('bcryptjs'); console.log(b.hashSync(process.argv[1], 10))" "$1"
