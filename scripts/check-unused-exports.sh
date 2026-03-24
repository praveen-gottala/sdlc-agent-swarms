#!/usr/bin/env bash
# check-unused-exports.sh
#
# Detects exported functions/types from index.ts barrel files that have
# zero import sites outside their defining module and test files.
#
# Usage: ./scripts/check-unused-exports.sh [--fail]
#   --fail: exit with code 1 if any unused exports are found (for CI)
#
# This script exists because the buildDesignSystemContextFromSpec bug went
# undetected — the function was exported but never called from any consumer.

set -euo pipefail

FAIL_MODE=false
if [[ "${1:-}" == "--fail" ]]; then
  FAIL_MODE=true
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNUSED_COUNT=0

echo "Checking for exported symbols with zero external import sites..."
echo ""

# Scan each package's index.ts for exported names
for index_file in "$REPO_ROOT"/packages/*/src/index.ts; do
  package_dir="$(dirname "$(dirname "$index_file")")"
  package_name="$(basename "$package_dir")"

  # Extract exported symbol names (export { foo, bar } and export { foo } from)
  exported_names=$(grep -oP '(?<=export \{ ).*?(?= \})' "$index_file" 2>/dev/null | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^type ' | grep -v '^$' || true)

  # Also extract "export { Name } from" single exports
  single_exports=$(grep -oP 'export \{ ([^}]+) \}' "$index_file" 2>/dev/null | sed 's/export { //;s/ }//' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^type ' | grep -v '^$' || true)

  all_exports=$(echo -e "${exported_names}\n${single_exports}" | sort -u | grep -v '^$' || true)

  for symbol in $all_exports; do
    # Skip type-only exports
    if [[ "$symbol" == "type" ]]; then
      continue
    fi

    # Count import sites outside this package (exclude the package's own src/ and its test files)
    import_count=$(grep -r --include='*.ts' --include='*.tsx' -l "$symbol" "$REPO_ROOT/packages" 2>/dev/null \
      | grep -v "$package_dir/src/" \
      | grep -v '\.test\.ts' \
      | grep -v '__test' \
      | grep -v 'node_modules' \
      | wc -l | tr -d ' ')

    if [[ "$import_count" -eq 0 ]]; then
      echo "  UNUSED: @agentforge/$package_name exports '$symbol' — 0 external consumers"
      UNUSED_COUNT=$((UNUSED_COUNT + 1))
    fi
  done
done

echo ""
if [[ "$UNUSED_COUNT" -gt 0 ]]; then
  echo "Found $UNUSED_COUNT exported symbol(s) with no external consumers."
  echo "Each should be either wired into consumers or removed from the barrel export."
  if $FAIL_MODE; then
    exit 1
  fi
else
  echo "All exported symbols have at least one external consumer."
fi
