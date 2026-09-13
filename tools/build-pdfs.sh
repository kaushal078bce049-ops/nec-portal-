#!/bin/sh
# Compile every exported LaTeX file to PDF with the portable Tectonic engine.
#
# Usage:  sh tools/build-pdfs.sh
# Output: latex/pdf/  (mirrors the latex/ layout: root files and split/)
#
# Tectonic downloads what it needs on first run and caches it, so the first
# file is slow and the rest are fast. Each file is independent, so a failure
# in one does not stop the others -- the summary at the end lists any that
# failed, with the first error line from its log.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEX="$ROOT/latex"
OUT="$TEX/pdf"
ENGINE="${TECTONIC:-C:/Users/ACER/tools/tectonic/tectonic.exe}"
LOGS="$OUT/_logs"

if [ ! -x "$ENGINE" ] && ! command -v "$ENGINE" >/dev/null 2>&1; then
  echo "Tectonic not found at: $ENGINE"
  echo "Set TECTONIC=/path/to/tectonic and re-run."
  exit 1
fi

mkdir -p "$OUT/split" "$LOGS"

pass=0; fail=0; failed=""
start_all=$(date +%s)

compile() {           # $1 = tex path, $2 = output dir, $3 = label
  name=$(basename "$1" .tex)
  printf '  %-46s ' "$3"
  t0=$(date +%s)
  if "$ENGINE" --outdir "$2" "$1" >"$LOGS/$name.log" 2>&1; then
    t1=$(date +%s)
    kb=$(du -k "$2/$name.pdf" 2>/dev/null | cut -f1)
    printf 'OK   %6s KB  %3ss\n' "${kb:-?}" "$((t1 - t0))"
    pass=$((pass + 1))
  else
    printf 'FAIL\n'
    grep -m1 -iE '^error|! ' "$LOGS/$name.log" 2>/dev/null | sed 's/^/        /'
    fail=$((fail + 1))
    failed="$failed $name"
  fi
}

echo "Compiling LaTeX -> PDF   (engine: $ENGINE)"
echo
echo "Combined volumes:"
for f in "$TEX"/*.tex; do
  [ -e "$f" ] || continue
  compile "$f" "$OUT" "$(basename "$f")"
done

echo
echo "Split volumes:"
for f in "$TEX"/split/*.tex; do
  [ -e "$f" ] || continue
  compile "$f" "$OUT/split" "split/$(basename "$f")"
done

end_all=$(date +%s)
echo
echo "------------------------------------------------------------"
echo "  compiled: $pass    failed: $fail    elapsed: $((end_all - start_all))s"
[ -n "$failed" ] && { echo "  failures:$failed"; echo "  logs in: $LOGS"; }
echo "  output:   $OUT"
total=$(du -sh "$OUT" 2>/dev/null | cut -f1)
echo "  size:     ${total:-unknown}"
echo "------------------------------------------------------------"

[ "$fail" -eq 0 ] || exit 1
