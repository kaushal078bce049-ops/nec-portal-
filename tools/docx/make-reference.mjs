/**
 * Build the Word reference document that gives every exported .docx its look.
 *
 * Pandoc copies the styles, page setup and theme out of a "reference.docx" and
 * applies them to whatever it writes. Its built-in default is serviceable but
 * plainly a default: 12pt Aptos on US Letter, headings in Office blue, block
 * quotes as bare indents and tables with a single hairline under the header.
 * For a 2,400-page engineering volume that is not good enough, and the fixes
 * are all in two XML files inside the zip.
 *
 * What this changes, and why each one matters here:
 *
 *   Page      A4 with 2.2 cm margins, matching the LaTeX volumes, so the Word
 *             and PDF editions paginate comparably. A4 is what will be printed
 *             in Nepal; US Letter would be wrong on every page.
 *   Body      10.5pt with 1.08 line spacing. The content is dense -- tables,
 *             worked arithmetic, option lists -- and 12pt/1.15 pushes the
 *             volumes past 3,000 pages without making them more readable.
 *   Headings  Slate blue, sized so chapter / subchapter / section are
 *             distinguishable at a glance, and keepNext so a heading never
 *             sits alone at the foot of a page.
 *   Callouts  The content uses "> " blocks as emphasis panels, not citations
 *             -- summaries, exam tips, key results. Styled as a tinted panel
 *             with a rule down the left, which is what they are.
 *   Tables    Full grid borders and a shaded header row. Pandoc's default
 *             leaves 3,500 tables in this content looking like loose columns.
 *
 * Run with:  node tools/docx/make-reference.mjs
 * It reads tools/docx/reference-default.docx (pandoc's own, kept verbatim as
 * the baseline) and writes tools/docx/reference.docx. Always patching a
 * pristine copy rather than the previous output is what makes it safe to run
 * repeatedly -- patching an already-patched file would match the wrong
 * elements the second time.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzip, zip } from './zip.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(HERE, 'reference-default.docx');
const OUT = path.join(HERE, 'reference.docx');
const parts = unzip(BASE);

// --- palette ---------------------------------------------------------------
const INK = '1F2933';       // body text
const HEAD = '1F3A5F';      // chapter and section headings
const SUBHEAD = '33475B';   // third-level headings
const RULE = 'C6CDD4';      // hairlines
const PANEL_BG = 'F4F6F8';  // callout fill
const PANEL_RULE = '8A94A0';// callout left edge
const TABLE_HEAD = 'EEF1F4';// table header fill

const read = (name) => {
  const b = parts.get(name);
  if (!b) throw new Error(`${name} is missing from ${path.basename(BASE)}`);
  return b.toString('utf8');
};
const write = (name, text) => parts.set(name, Buffer.from(text, 'utf8'));

/** Replace the whole <w:style> element carrying this styleId. */
function replaceStyle(xml, id, replacement) {
  const at = xml.indexOf(`w:styleId="${id}"`);
  if (at < 0) throw new Error(`style ${id} not found in the reference`);
  const start = xml.lastIndexOf('<w:style ', at);
  const end = xml.indexOf('</w:style>', at) + '</w:style>'.length;
  return xml.slice(0, start) + replacement + xml.slice(end);
}

const heading = (id, name, level, size, colour, before, after, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}">
    <w:name w:val="${name}" />
    <w:basedOn w:val="Normal" />
    <w:next w:val="BodyText" />
    <w:link w:val="${id}Char" />
    <w:uiPriority w:val="9" />
    <w:qFormat />
    <w:pPr>
      <w:keepNext /><w:keepLines />
      <w:spacing w:before="${before}" w:after="${after}" />
      ${extra}
      <w:outlineLvl w:val="${level}" />
    </w:pPr>
    <w:rPr>
      <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" w:cstheme="majorBidi" />
      <w:b />
      <w:color w:val="${colour}" />
      <w:sz w:val="${size}" /><w:szCs w:val="${size}" />
    </w:rPr>
  </w:style>`;

function patchStyles() {
  let s = read('word/styles.xml');

  // Body defaults. 21 half-points = 10.5pt; line 259 twentieths = 1.08 lines.
  s = s.replace(
    /<w:sz w:val="24" \/>\s*<w:szCs w:val="24" \/>/,
    '<w:sz w:val="21" /><w:szCs w:val="21" />',
  );
  s = s.replace(
    '<w:pPr>\n        <w:spacing w:after="200" />\n      </w:pPr>',
    '<w:pPr><w:spacing w:after="120" w:line="259" w:lineRule="auto" /></w:pPr>',
  );

  s = replaceStyle(s, 'Normal', `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal" />
    <w:qFormat />
    <w:rPr><w:color w:val="${INK}" /></w:rPr>
  </w:style>`);

  s = replaceStyle(s, 'BodyText', `<w:style w:type="paragraph" w:styleId="BodyText">
    <w:name w:val="Body Text" />
    <w:basedOn w:val="Normal" />
    <w:link w:val="BodyTextChar" />
    <w:qFormat />
    <w:pPr><w:spacing w:before="60" w:after="120" /></w:pPr>
  </w:style>`);

  // Option lists and answer lines sit one under another; 36 twentieths of a
  // point between them is enough to separate without opening gaps.
  s = replaceStyle(s, 'Compact', `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Compact">
    <w:name w:val="Compact" />
    <w:basedOn w:val="BodyText" />
    <w:qFormat />
    <w:pPr><w:spacing w:before="24" w:after="24" /></w:pPr>
  </w:style>`);

  s = replaceStyle(s, 'Title', `<w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title" />
    <w:basedOn w:val="Normal" />
    <w:next w:val="Subtitle" />
    <w:link w:val="TitleChar" />
    <w:qFormat />
    <w:pPr>
      <w:spacing w:before="2400" w:after="120" w:line="240" w:lineRule="auto" />
      <w:jc w:val="center" />
    </w:pPr>
    <w:rPr>
      <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" />
      <w:b />
      <w:color w:val="${HEAD}" />
      <w:sz w:val="52" /><w:szCs w:val="52" />
    </w:rPr>
  </w:style>`);

  s = replaceStyle(s, 'Subtitle', `<w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle" />
    <w:basedOn w:val="Normal" />
    <w:next w:val="Author" />
    <w:link w:val="SubtitleChar" />
    <w:qFormat />
    <w:pPr><w:spacing w:after="360" /><w:jc w:val="center" /></w:pPr>
    <w:rPr>
      <w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi" />
      <w:color w:val="${SUBHEAD}" />
      <w:sz w:val="28" /><w:szCs w:val="28" />
    </w:rPr>
  </w:style>`);

  s = replaceStyle(s, 'Author', `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Author">
    <w:name w:val="Author" />
    <w:basedOn w:val="Normal" />
    <w:next w:val="BodyText" />
    <w:qFormat />
    <w:pPr><w:keepNext /><w:spacing w:after="600" /><w:jc w:val="center" /></w:pPr>
    <w:rPr><w:color w:val="${SUBHEAD}" /><w:sz w:val="24" /><w:szCs w:val="24" /></w:rPr>
  </w:style>`);

  // A rule under every chapter heading, so a 2,400-page volume reads as a book.
  const chapterRule = `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${RULE}" /></w:pBdr>`;
  s = replaceStyle(s, 'Heading1', heading('Heading1', 'heading 1', 0, 36, HEAD, 400, 160, chapterRule));
  s = replaceStyle(s, 'Heading2', heading('Heading2', 'heading 2', 1, 28, HEAD, 320, 120));
  s = replaceStyle(s, 'Heading3', heading('Heading3', 'heading 3', 2, 24, SUBHEAD, 240, 100));

  s = replaceStyle(s, 'BlockText', `<w:style w:type="paragraph" w:styleId="BlockText">
    <w:name w:val="Block Text" />
    <w:basedOn w:val="Normal" />
    <w:next w:val="BodyText" />
    <w:qFormat />
    <w:pPr>
      <w:spacing w:before="120" w:after="120" />
      <w:ind w:left="284" w:right="0" w:firstLine="0" />
      <w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${PANEL_RULE}" /></w:pBdr>
      <w:shd w:val="clear" w:color="auto" w:fill="${PANEL_BG}" />
    </w:pPr>
  </w:style>`);

  s = replaceStyle(s, 'Table', `<w:style w:type="table" w:default="1" w:styleId="Table">
    <w:name w:val="Table" />
    <w:basedOn w:val="TableNormal" />
    <w:qFormat />
    <w:pPr><w:spacing w:before="40" w:after="40" /></w:pPr>
    <w:rPr><w:sz w:val="19" /><w:szCs w:val="19" /></w:rPr>
    <w:tblPr>
      <w:tblInd w:w="0" w:type="dxa" />
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:color="${RULE}" />
        <w:left w:val="single" w:sz="6" w:color="${RULE}" />
        <w:bottom w:val="single" w:sz="6" w:color="${RULE}" />
        <w:right w:val="single" w:sz="6" w:color="${RULE}" />
        <w:insideH w:val="single" w:sz="4" w:color="${RULE}" />
        <w:insideV w:val="single" w:sz="4" w:color="${RULE}" />
      </w:tblBorders>
      <w:tblCellMar>
        <w:top w:w="40" w:type="dxa" /><w:left w:w="108" w:type="dxa" />
        <w:bottom w:w="40" w:type="dxa" /><w:right w:w="108" w:type="dxa" />
      </w:tblCellMar>
    </w:tblPr>
    <w:tblStylePr w:type="firstRow">
      <w:rPr><w:b /><w:color w:val="${HEAD}" /></w:rPr>
      <w:tcPr>
        <w:shd w:val="clear" w:color="auto" w:fill="${TABLE_HEAD}" />
        <w:tcBorders><w:bottom w:val="single" w:sz="12" w:color="${PANEL_RULE}" /></w:tcBorders>
        <w:vAlign w:val="bottom" />
      </w:tcPr>
    </w:tblStylePr>
  </w:style>`);

  write('word/styles.xml', s);
  return s.length;
}

/**
 * A centred page number in the footer.
 *
 * Pandoc adds no footer of any kind, which is defensible for a web page and
 * wrong for a 2,600-page printable volume: an unnumbered book cannot be cited,
 * cross-referenced or reassembled after printing. Adding one means four
 * coordinated edits, because a Word footer is a separate part of the package:
 * the part itself, its content type, a relationship from the document, and a
 * reference to that relationship in the section properties. Miss any one and
 * Word reports the file as corrupt rather than simply ignoring the footer.
 *
 * PAGE is a field, not text, so Word renumbers it by itself.
 */
const FOOTER_RID = 'rId90';

const FOOTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:jc w:val="center" />
      <w:rPr><w:color w:val="${PANEL_RULE}" /><w:sz w:val="18" /></w:rPr>
    </w:pPr>
    <w:r><w:rPr><w:color w:val="${PANEL_RULE}" /><w:sz w:val="18" /></w:rPr>
      <w:fldChar w:fldCharType="begin" /></w:r>
    <w:r><w:rPr><w:color w:val="${PANEL_RULE}" /><w:sz w:val="18" /></w:rPr>
      <w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:rPr><w:color w:val="${PANEL_RULE}" /><w:sz w:val="18" /></w:rPr>
      <w:fldChar w:fldCharType="separate" /></w:r>
    <w:r><w:rPr><w:color w:val="${PANEL_RULE}" /><w:sz w:val="18" /></w:rPr>
      <w:t>1</w:t></w:r>
    <w:r><w:rPr><w:color w:val="${PANEL_RULE}" /><w:sz w:val="18" /></w:rPr>
      <w:fldChar w:fldCharType="end" /></w:r>
  </w:p>
</w:ftr>`;

function patchFooter() {
  write('word/footer1.xml', FOOTER_XML);

  let ct = read('[Content_Types].xml');
  if (!ct.includes('footer1.xml')) {
    ct = ct.replace('</Types>',
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml" /></Types>');
    write('[Content_Types].xml', ct);
  }

  let rels = read('word/_rels/document.xml.rels');
  if (!rels.includes('footer1.xml')) {
    rels = rels.replace('</Relationships>',
      `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Id="${FOOTER_RID}" Target="footer1.xml" /></Relationships>`);
    write('word/_rels/document.xml.rels', rels);
  }
}

function patchDocument() {
  let s = read('word/document.xml');
  // A4 portrait, 2.2 cm margins (1 cm = 567 twentieths of a point), with room
  // reserved for the footer added above.
  s = s.replace(
    /<w:sectPr>[\s\S]*?<\/w:sectPr>/,
    `<w:sectPr>
      <w:footerReference w:type="default" r:id="${FOOTER_RID}" />
      <w:pgSz w:w="11906" w:h="16838" />
      <w:pgMar w:top="1361" w:right="1247" w:bottom="1361" w:left="1247"
               w:header="709" w:footer="709" w:gutter="0" />
      <w:footnotePr><w:numRestart w:val="eachSect" /></w:footnotePr>
    </w:sectPr>`,
  );
  write('word/document.xml', s);
  return s.length;
}

const a = patchStyles();
patchFooter();
const b = patchDocument();
const bytes = zip(parts, OUT);

console.log(`reference.docx rebuilt from ${path.basename(BASE)}`);
console.log(`  styles.xml    ${String(a).padStart(7)} bytes`);
console.log(`  document.xml  ${String(b).padStart(7)} bytes`);
console.log(`  parts         ${String(parts.size).padStart(7)}  (footer1.xml added)`);
console.log(`  written       ${String(bytes).padStart(7)} bytes -> ${path.relative(process.cwd(), OUT)}`);
