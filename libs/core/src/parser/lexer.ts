import type { Align } from './ir';

export type BlockType = 'item' | 'info' | 'rule' | 'sample' | 'head';

export type PreambleType = 'css' | 'fonts';

export type Token =
  | { kind: 'preamble'; type: PreambleType; content: string }
  | { kind: 'hidden-delimiter' }
  | { kind: 'content-ref'; key: string; content: string }
  | { kind: 'page-break' }
  | { kind: 'column-break' }
  | { kind: 'full-width-toggle' }
  | { kind: 'hr' }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'centered-text'; content: string }
  | { kind: 'block-open'; type: BlockType; raw: string }
  | { kind: 'table-header'; cells: string[] }
  | { kind: 'table-sep'; aligns: Align[] }
  | { kind: 'table-row'; cells: string[] }
  | { kind: 'table-footnote'; marker: string; text: string }
  | { kind: 'list-item'; text: string }
  | { kind: 'trait-line'; traits: string[] }
  | { kind: 'reference'; key: string }
  | { kind: 'text'; content: string }
  | { kind: 'blank' };

const PREAMBLE_KEYWORDS: readonly PreambleType[] = ['css', 'fonts'];
const BLOCK_KEYWORDS: readonly BlockType[] = [
  'item',
  'info',
  'rule',
  'sample',
  'head',
];
const ALL_KEYWORDS = [...PREAMBLE_KEYWORDS, ...BLOCK_KEYWORDS] as const;
const KEYWORD_RE = new RegExp(`^(${ALL_KEYWORDS.join('|')})\\s*\\(`);

export function tokenize(input: string): Token[] {
  const lines = input.split('\n');
  const tokens: Token[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      tokens.push({ kind: 'blank' });
      i++;
      continue;
    }

    // Lone-marker tokens require no leading whitespace.
    if (line === '%') {
      tokens.push({ kind: 'hidden-delimiter' });
      i++;
      continue;
    }
    if (line === '=') {
      tokens.push({ kind: 'page-break' });
      i++;
      continue;
    }
    if (line === '|') {
      tokens.push({ kind: 'column-break' });
      i++;
      continue;
    }
    if (line === '/') {
      tokens.push({ kind: 'full-width-toggle' });
      i++;
      continue;
    }
    if (line === '-') {
      tokens.push({ kind: 'hr' });
      i++;
      continue;
    }

    // Preamble or block-open: keyword followed by (
    const kwMatch = trimmed.match(KEYWORD_RE);
    if (kwMatch) {
      const keyword = kwMatch[1];
      const captured = captureBalanced(lines, i, '(', ')');
      if (PREAMBLE_KEYWORDS.includes(keyword as PreambleType)) {
        tokens.push({
          kind: 'preamble',
          type: keyword as PreambleType,
          content: captured.inner,
        });
      } else {
        tokens.push({
          kind: 'block-open',
          type: keyword as BlockType,
          raw: captured.inner,
        });
      }
      i = captured.endLine + 1;
      continue;
    }

    // Content-ref definition: key {
    const refMatch = line.match(/^(\w+)\s*\{\s*$/);
    if (refMatch) {
      const captured = captureBalanced(lines, i, '{', '}');
      tokens.push({
        kind: 'content-ref',
        key: refMatch[1],
        content: captured.inner,
      });
      i = captured.endLine + 1;
      continue;
    }

    // Heading
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      tokens.push({
        kind: 'heading',
        level: hMatch[1].length,
        text: hMatch[2],
      });
      i++;
      continue;
    }

    // Centered text marker: ^ text
    const cMatch = trimmed.match(/^\^\s+(.+)$/);
    if (cMatch) {
      tokens.push({ kind: 'centered-text', content: cMatch[1] });
      i++;
      continue;
    }

    // Trait line: ;a,b,c
    if (trimmed.startsWith(';')) {
      const traits = trimmed
        .slice(1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      tokens.push({ kind: 'trait-line', traits });
      i++;
      continue;
    }

    // Content reference. A line that's *only* `{{key}}` is its own token so
    // the parser can expand it as a block; inline uses like "Hello {{name}}!"
    // fall through to the text branch and stay literal (references are
    // block-level, defined elsewhere as `key { ... }`).
    const refMatchUse = trimmed.match(/^\{\{(\w+)}}$/);
    if (refMatchUse) {
      tokens.push({ kind: 'reference', key: refMatchUse[1] });
      i++;
      continue;
    }

    // List item: * foo or - foo (lone - is hr, handled above)
    if (
      trimmed.startsWith('* ') ||
      (trimmed.startsWith('- ') && trimmed.length > 2)
    ) {
      tokens.push({ kind: 'list-item', text: trimmed.slice(2) });
      i++;
      continue;
    }

    // Headerless table: a leading separator/rule row (`|---|---|`) with no
    // header line above it. The rule row still carries per-column alignment;
    // its cell count fixes the column count. A bare `---` (no `|`) isn't a
    // separator row, so it stays plain text and doesn't get swallowed here.
    if (isSeparatorRow(trimmed)) {
      const aligns = parseAligns(trimmed, splitTableRow(trimmed).length);
      tokens.push({ kind: 'table-sep', aligns });
      i++;
      i = consumeTableBody(lines, i, tokens);
      continue;
    }

    // Table: line with `|` and a `---` separator on the next line
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const nextTrim = lines[i + 1].trim();
      if (isSeparatorRow(nextTrim)) {
        const headerCells = splitTableRow(line);
        const aligns = parseAligns(nextTrim, headerCells.length);
        tokens.push({ kind: 'table-header', cells: headerCells });
        tokens.push({ kind: 'table-sep', aligns });
        i += 2;
        i = consumeTableBody(lines, i, tokens);
        continue;
      }
    }

    // Default: text
    tokens.push({ kind: 'text', content: line });
    i++;
  }

  return tokens;
}

// Footnote line: `. [<marker>] <text>` where marker is `*` (unnumbered) or one
// or more digits. Anchored to the start of the trimmed line so prose dots
// don't masquerade as footnotes.
const FOOTNOTE_RE = /^\.\s*\[(\*|\d+)\]\s+(.+)$/;

function matchFootnote(
  trimmed: string,
): { marker: string; text: string } | undefined {
  const m = trimmed.match(FOOTNOTE_RE);
  return m ? { marker: m[1], text: m[2].trim() } : undefined;
}

function consumeTableBody(
  lines: string[],
  start: number,
  tokens: Token[],
): number {
  let i = start;
  while (i < lines.length) {
    const t = lines[i].trim();
    const fn = matchFootnote(t);
    if (fn) {
      tokens.push({ kind: 'table-footnote', marker: fn.marker, text: fn.text });
      i++;
      continue;
    }
    if (t === '') {
      // Blank lines stay part of the table only if a footnote follows.
      let peek = i + 1;
      while (peek < lines.length && lines[peek].trim() === '') peek++;
      if (peek < lines.length && matchFootnote(lines[peek].trim())) {
        i = peek;
        continue;
      }
      break;
    }
    if (!t.includes('|')) break;
    tokens.push({ kind: 'table-row', cells: splitTableRow(lines[i]) });
    i++;
  }
  return i;
}

// A table separator/rule row: only whitespace, dashes, colons, and pipes, and
// carrying at least one `---` run and one `|`. Requiring the pipe keeps a bare
// `---` (which the DSL treats as plain text) from reading as a one-column
// separator, which matters now that a lone separator row starts a table.
function isSeparatorRow(trimmed: string): boolean {
  return (
    /^[\s\-:|]+$/.test(trimmed) &&
    trimmed.includes('---') &&
    trimmed.includes('|')
  );
}

function splitTableRow(line: string): string[] {
  // Strip the optional leading/trailing border pipes first so they don't
  // produce phantom empty cells. Splitting on the interior `|`s then preserves
  // genuinely empty cells — e.g. `| | Price |` is a blank header over a column,
  // not a missing column. We can't `.filter(Boolean)` away empties because that
  // would also drop those intentional blanks and desync the column count.
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function parseAligns(separator: string, columnCount: number): Align[] {
  return splitTableRow(separator)
    .map((t): Align => {
      if (t.startsWith(':') && t.endsWith(':')) return 'center';
      if (t.endsWith(':')) return 'right';
      return 'left';
    })
    .slice(0, columnCount);
}

function captureBalanced(
  lines: string[],
  startLine: number,
  open: string,
  close: string,
): { inner: string; endLine: number } {
  let depth = 0;
  let started = false;

  for (let li = startLine; li < lines.length; li++) {
    const line = lines[li];
    for (const ch of line) {
      if (ch === open) {
        if (!started) {
          started = true;
          depth = 1;
        } else {
          depth++;
        }
      } else if (ch === close && started) {
        depth--;
        if (depth === 0) {
          const block = lines.slice(startLine, li + 1).join('\n');
          const openIdx = block.indexOf(open);
          const closeIdx = block.lastIndexOf(close);
          return {
            inner: block.slice(openIdx + 1, closeIdx).trim(),
            endLine: li,
          };
        }
      }
    }
  }
  // Unbalanced — take everything after the open delimiter.
  const block = lines.slice(startLine).join('\n');
  const openIdx = block.indexOf(open);
  return {
    inner: openIdx >= 0 ? block.slice(openIdx + 1).trim() : block,
    endLine: lines.length - 1,
  };
}
