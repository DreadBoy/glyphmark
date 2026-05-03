import type { Align } from './ir';

export type BlockType =
  | 'item'
  | 'info'
  | 'note'
  | 'rule'
  | 'sample'
  | 'head'
  | 'right';

export type PreambleType = 'watermark' | 'css' | 'fonts';

export type Token =
  | { kind: 'preamble'; type: PreambleType; content: string }
  | { kind: 'pagenumbers' }
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
  | { kind: 'text'; content: string }
  | { kind: 'blank' };

const PREAMBLE_KEYWORDS: readonly PreambleType[] = [
  'watermark',
  'css',
  'fonts',
];
const BLOCK_KEYWORDS: readonly BlockType[] = [
  'item',
  'info',
  'note',
  'rule',
  'sample',
  'head',
  'right',
];
const ALL_KEYWORDS = [...PREAMBLE_KEYWORDS, ...BLOCK_KEYWORDS] as const;
const KEYWORD_RE = new RegExp(`^(${ALL_KEYWORDS.join('|')})\\s*\\(`);

export function tokenize(input: string): Token[] {
  const lines = input.split('\n');
  const tokens: Token[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
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

    if (/^\s*pagenumbers\s*$/.test(line)) {
      tokens.push({ kind: 'pagenumbers' });
      i++;
      continue;
    }

    // Preamble or block-open: keyword followed by (
    const kwMatch = trimmed.match(KEYWORD_RE);
    if (kwMatch) {
      const keyword = kwMatch[1]!;
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
        key: refMatch[1]!,
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
        level: hMatch[1]!.length,
        text: hMatch[2]!,
      });
      i++;
      continue;
    }

    // Centered text marker: ^ text
    const cMatch = trimmed.match(/^\^\s+(.+)$/);
    if (cMatch) {
      tokens.push({ kind: 'centered-text', content: cMatch[1]! });
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

    // List item: * foo or - foo (lone - is hr, handled above)
    if (
      trimmed.startsWith('* ') ||
      (trimmed.startsWith('- ') && trimmed.length > 2)
    ) {
      tokens.push({ kind: 'list-item', text: trimmed.slice(2) });
      i++;
      continue;
    }

    // Table: line with `|` and a `---` separator on the next line
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const nextTrim = lines[i + 1]!.trim();
      if (/^[\s\-:|]+$/.test(nextTrim) && nextTrim.includes('---')) {
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
  return m ? { marker: m[1]!, text: m[2]!.trim() } : undefined;
}

function consumeTableBody(
  lines: string[],
  start: number,
  tokens: Token[],
): number {
  let i = start;
  while (i < lines.length) {
    const t = lines[i]!.trim();
    const fn = matchFootnote(t);
    if (fn) {
      tokens.push({ kind: 'table-footnote', marker: fn.marker, text: fn.text });
      i++;
      continue;
    }
    if (t === '') {
      // Blank lines stay part of the table only if a footnote follows.
      let peek = i + 1;
      while (peek < lines.length && lines[peek]!.trim() === '') peek++;
      if (peek < lines.length && matchFootnote(lines[peek]!.trim())) {
        i = peek;
        continue;
      }
      break;
    }
    if (!t.includes('|')) break;
    tokens.push({ kind: 'table-row', cells: splitTableRow(lines[i]!) });
    i++;
  }
  return i;
}

function splitTableRow(line: string): string[] {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
}

function parseAligns(separator: string, columnCount: number): Align[] {
  return separator
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
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
    const line = lines[li]!;
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
