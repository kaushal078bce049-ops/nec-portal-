#!/bin/sh
# Convert every exported Markdown file to Word with pandoc.
#
# Usage:  npm run export:docx   (writes docx/*.md)
#         sh tools/build-docx.sh
# Output: docx/word/  (mirrors the docx/ layout: root files, split/, chapters/)
#
# The reference document is rebuilt first, so the styling in tools/docx/
# make-reference.mjs always matches what ships. Each file is independent, so a
# failure in one does not stop the others; the summary at the end lists any
# that failed.
#
# Word itself is not involved and is not required. Pandoc writes the OOXML
# directly, which is why this runs on a machine with no Office installed.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/docx"
OUT="$SRC/word"
REF="$ROOT/tools/docx/reference.docx"
PANDOC="${PANDOC:-C:/Users/ACER/tools/pandoc/pandoc.exe}"
NODE="${NODE:-node}"

if [ ! -x "$PANDOC" ] && ! command -v "$PANDOC" >/dev/null 2>&1; then
  echo "pandoc not found at: $PANDOC"
  echo "Install it from https://pandoc.org (the Windows zip needs no admin"
  echo "rights -- extract it and set PANDOC=/path/to/pandoc.exe)."
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "No Markdown to convert. Run:  npm run export:docx"
  exit 1
fi

echo "Rebuilding the Word reference document"
"$NODE" "$ROOT/tools/docx/make-reference.mjs" || exit 1
echo

mkdir -p "$OUT/split" "$OUT/chapters"

pass=0; fail=0; failed=""; last_group=""
start_all=$(date +%s)

# --toc            a real Word table-of-contents field, which Word repaginates
#                  itself -- a static list would be wrong the moment anyone
#                  edits the file.
# --toc-depth=2    chapters and sections. Depth 3 in the theory volume would
#                  produce a sixty-page contents list.
# markdown+...     the reader. pipe_tables, sub- and superscript and raw
#                  attributes are what the exporter emits; explicitly named so
#                  a future pandoc default cannot silently drop one.
FROM='markdown+pipe_tables+superscript+subscript+raw_attribute'

convert() {           # $1 = md path, $2 = output dir, $3 = label
  name=$(basename "$1" .md)
  printf '  %-46s ' "$3"
  t0=$(date +%s)
  if "$PANDOC" "$1" -o "$2/$name.docx" \
      --from="$FROM" --to=docx \
      --standalone --toc --toc-depth=2 \
      --reference-doc="$REF" 2>"$2/.err"; then
    t1=$(date +%s)
    kb=$(du -k "$2/$name.docx" 2>/dev/null | cut -f1)
    printf 'OK   %6s KB  %3ss\n' "${kb:-?}" "$((t1 - t0))"
    pass=$((pass + 1))
  else
    # A locked target is the common failure and says nothing useful on its
    # own, so name the cause rather than printing a Haskell backtrace.
    if grep -q 'permission denied' "$2/.err" 2>/dev/null; then
      printf 'LOCKED\n'
      printf '        %s is open in Word. Close it and re-run.\n' "$name.docx"
    else
      printf 'FAIL\n'
      head -3 "$2/.err" 2>/dev/null | sed 's/^/        /'
    fi
    fail=$((fail + 1))
    failed="$failed $name"
  fi
  rm -f "$2/.err"
}

echo "Converting Markdown -> Word   (pandoc: $("$PANDOC" --version | head -1))"
echo
echo "Combined volumes:"
for f in "$SRC"/*.md; do
  [ -e "$f" ] || continue
  convert "$f" "$OUT" "$(basename "$f")"
done

if [ -d "$SRC/split" ]; then
  echo
  echo "Split volumes:"
  for f in "$SRC"/split/*.md; do
    [ -e "$f" ] || continue
    convert "$f" "$OUT/split" "split/$(basename "$f")"
  done
fi

# The handover trees: one folder per syllabus chapter, and one per kind of
# paper. Both are two levels deep, so a single loop covers them.
#
# Every expansion stays quoted. The folder names carry spaces and full stops,
# and an unquoted "$d" would split "1. Basic Civil Engineering" into
# three arguments and write the files to three directories that do not exist.
for d in "$SRC"/chapters/*/ "$SRC"/papers/*/; do
  [ -d "$d" ] || continue
  rel="${d#$SRC/}"
  rel="${rel%/}"
  first="${rel%%/*}"
  if [ "$first" != "$last_group" ]; then
    echo
    echo "$first:"
    last_group="$first"
  fi
  mkdir -p "$OUT/$rel"
  for f in "$d"*.md; do
    [ -e "$f" ] || continue
    convert "$f" "$OUT/$rel" "${rel#*/}/$(basename "$f")"
  done
done

end_all=$(date +%s)
echo
echo "------------------------------------------------------------"
echo "  converted: $pass    failed: $fail    elapsed: $((end_all - start_all))s"
[ -n "$failed" ] && echo "  failures:$failed"
echo "  output:    $OUT"
total=$(du -sh "$OUT" 2>/dev/null | cut -f1)
echo "  size:      ${total:-unknown}"
echo "------------------------------------------------------------"
echo
echo "  Open any file and accept Word's prompt to update the table of"
echo "  contents -- the TOC is a field, so it fills in on first open."

[ "$fail" -eq 0 ] || exit 1
