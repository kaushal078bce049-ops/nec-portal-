/**
 * Minimal, injection-safe formatter for the markdown subset used in authored
 * content (theory bodies, worked solutions, revision cards).
 *
 * HTML is escaped *first*, then a fixed set of formatting patterns is applied,
 * so no input can introduce a tag or attribute. This keeps us off a markdown
 * dependency without opening an XSS hole.
 *
 * Deliberately NOT for user-generated content — forum posts are rendered as
 * plain text. If rich forum formatting is ever wanted, use a real sanitiser.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Inline spans: `code`, **bold**, *italic*, superscript^{} and subscript_{}. */
function inline(text: string): string {
  return (
    escapeHtml(text)
      // `code`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // **bold**
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // *italic*
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
      // x^{2}  ->  superscript (units and powers are everywhere in these solutions)
      .replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>')
      // H_{2}O -> subscript
      .replace(/_\{([^}]+)\}/g, '<sub>$1</sub>')
  );
}

interface Block {
  type: 'p' | 'h2' | 'h3' | 'ul' | 'ol' | 'table' | 'quote';
  lines: string[];
}

function toBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '') {
      flush();
      continue;
    }
    if (/^###\s+/.test(line)) {
      flush();
      blocks.push({ type: 'h3', lines: [line.replace(/^###\s+/, '')] });
      continue;
    }
    if (/^##\s+/.test(line)) {
      flush();
      blocks.push({ type: 'h2', lines: [line.replace(/^##\s+/, '')] });
      continue;
    }
    if (/^>\s?/.test(line)) {
      if (current?.type !== 'quote') {
        flush();
        current = { type: 'quote', lines: [] };
      }
      current.lines.push(line.replace(/^>\s?/, ''));
      continue;
    }
    if (/^\|/.test(line)) {
      if (current?.type !== 'table') {
        flush();
        current = { type: 'table', lines: [] };
      }
      current.lines.push(line);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (current?.type !== 'ul') {
        flush();
        current = { type: 'ul', lines: [] };
      }
      current.lines.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      if (current?.type !== 'ol') {
        flush();
        current = { type: 'ol', lines: [] };
      }
      current.lines.push(line.replace(/^\d+[.)]\s+/, ''));
      continue;
    }

    if (current?.type !== 'p') {
      flush();
      current = { type: 'p', lines: [] };
    }
    current.lines.push(line);
  }
  flush();
  return blocks;
}

function renderTable(rows: string[]): string {
  const cells = rows
    .map((r) =>
      r
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    )
    // Drop the |---|---| separator row.
    .filter((cols) => !cols.every((c) => /^:?-{2,}:?$/.test(c)));

  if (cells.length === 0) return '';
  const [head, ...body] = cells;

  const thead = `<thead><tr>${head!.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = body.length
    ? `<tbody>${body
        .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
    : '';

  return `<div class="scroll-x"><table>${thead}${tbody}</table></div>`;
}

/** Returns an HTML string safe to pass to dangerouslySetInnerHTML. */
export function renderMarkdown(source: string): string {
  if (!source) return '';

  return toBlocks(source)
    .map((block) => {
      switch (block.type) {
        case 'h2':
          return `<h2>${inline(block.lines[0]!)}</h2>`;
        case 'h3':
          return `<h3>${inline(block.lines[0]!)}</h3>`;
        case 'ul':
          return `<ul>${block.lines.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`;
        case 'ol':
          return `<ol>${block.lines.map((l) => `<li>${inline(l)}</li>`).join('')}</ol>`;
        case 'table':
          return renderTable(block.lines);
        case 'quote':
          return `<blockquote>${inline(block.lines.join(' '))}</blockquote>`;
        default:
          return `<p>${inline(block.lines.join(' '))}</p>`;
      }
    })
    .join('');
}
