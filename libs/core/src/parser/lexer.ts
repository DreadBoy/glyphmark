import type { Align, TokenId, TokenSpan } from './ir';

export type BlockType = 'item' | 'info' | 'rule' | 'sample' | 'head';

export type PreambleType = 'css' | 'fonts';

// The intrinsic data of a token, before provenance metadata is attached. Kept
// separate so `tokenizeInto` can stamp `id`/`span` onto every variant in one
// place. `block-open` and `content-ref` additionally carry their already-lexed
// inner tokens as `children`, so the parser never re-tokenizes raw strings.
type TokenData =
  | { kind: 'preamble'; type: PreambleType; content: string }
  | { kind: 'hidden-delimiter' }
  | { kind: 'content-ref'; key: string; content: string; children: Token[] }
  | { kind: 'page-break' }
  | { kind: 'column-break' }
  | { kind: 'full-width-toggle' }
  | { kind: 'hr' }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'centered-text'; content: string }
  | { kind: 'block-open'; type: BlockType; raw: string; children: Token[] }
  | { kind: 'table-header'; cells: string[] }
  | { kind: 'table-sep'; aligns: Align[] }
  | { kind: 'table-row'; cells: string[] }
  | { kind: 'table-footnote'; marker: string; text: string }
  | { kind: 'list-item'; text: string }
  | { kind: 'trait-line'; traits: string[] }
  | { kind: 'reference'; key: string }
  | { kind: 'text'; content: string }
  | { kind: 'blank' };

// Provenance metadata every token carries. `id` is an opaque, parse-scoped
// handle (see {@link TokenId}); `span` is the token's absolute source position.
type TokenMeta = { id: TokenId; span: TokenSpan };

// Distribute `& TokenMeta` across each union member so `Token` stays a
// discriminated union (a plain `TokenData & TokenMeta` intersection would break
// `Extract<Token, { kind: '…' }>` narrowing used by the parser).
type WithMeta<T> = T extends unknown ? T & TokenMeta : never;

export type Token = WithMeta<TokenData>;

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

// Running state shared across the whole lex of one document: a monotonic token
// id counter. Ids are allocated in reading order (pre-order over the token
// tree — a block/ref parent is stamped before its children are lexed).
type LexCtx = { next: number };

/**
 * Tokenize a `.glyph` document. Every token carries a parse-scoped `id` and an
 * absolute source `span`; `block-open`/`content-ref` tokens additionally carry
 * their inner `children` tokens. Ids are unique per call and allocated in
 * reading order, but treat them as opaque — resolve them against the map from
 * {@link buildTokenMap} (or `GlyphDocument.tokenMap`) of the *same* lex.
 */
export function tokenize(input: string): Token[] {
  return tokenizeInto(input, { next: 0 }, 0, 1);
}

/**
 * Flatten a token tree into a `TokenId → span` lookup, walking into
 * `block-open`/`content-ref` children so every token — at any depth — is
 * resolvable through one map.
 */
export function buildTokenMap(tokens: Token[]): Map<TokenId, TokenSpan> {
  const map = new Map<TokenId, TokenSpan>();
  const walk = (ts: Token[]): void => {
    for (const t of ts) {
      map.set(t.id, t.span);
      if (t.kind === 'block-open' || t.kind === 'content-ref') walk(t.children);
    }
  };
  walk(tokens);
  return map;
}

// Lex `input` whose first character sits at absolute offset `baseOffset` on
// absolute (1-based) line `baseLine` of the original document. The top-level
// call passes `0`/`1`; nested block/ref content passes the base of its trimmed
// inner (see `captureBalanced`), so every span is absolute and composes exactly
// across nesting (each inner is a contiguous substring of its parent's).
function tokenizeInto(
  input: string,
  ctx: LexCtx,
  baseOffset: number,
  baseLine: number,
): Token[] {
  const lines = input.split('\n');
  // Absolute-within-`input` start offset of each line (column 0).
  const lineStart: number[] = [];
  {
    let acc = 0;
    for (const line of lines) {
      lineStart.push(acc);
      acc += line.length + 1; // +1 for the '\n' that split() removed
    }
  }
  const tokens: Token[] = [];

  // Span covering physical lines [startLi..endLi]: column 0 of the first line
  // to just past the last char of the last (exclusive end — the position of the
  // trailing '\n', or EOF).
  const spanOf = (startLi: number, endLi: number): TokenSpan => ({
    startLine: baseLine + startLi,
    endLine: baseLine + endLi,
    startOffset: baseOffset + lineStart[startLi],
    endOffset: baseOffset + lineStart[endLi] + lines[endLi].length,
  });

  // Stamp id + span onto a token and append it. Allocates the id at append
  // time, which keeps single-line tokens in reading order.
  const push = (data: TokenData, startLi: number, endLi: number = startLi) => {
    tokens.push({
      ...data,
      id: ctx.next++,
      span: spanOf(startLi, endLi),
    } as Token);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      push({ kind: 'blank' }, i);
      i++;
      continue;
    }

    // Lone-marker tokens require no leading whitespace.
    if (line === '%') {
      push({ kind: 'hidden-delimiter' }, i);
      i++;
      continue;
    }
    if (line === '=') {
      push({ kind: 'page-break' }, i);
      i++;
      continue;
    }
    if (line === '|') {
      push({ kind: 'column-break' }, i);
      i++;
      continue;
    }
    if (line === '/') {
      push({ kind: 'full-width-toggle' }, i);
      i++;
      continue;
    }
    if (line === '-') {
      push({ kind: 'hr' }, i);
      i++;
      continue;
    }

    // Preamble or block-open: keyword followed by (
    const kwMatch = trimmed.match(KEYWORD_RE);
    if (kwMatch) {
      const keyword = kwMatch[1];
      const captured = captureBalanced(lines, i, '(', ')');
      if (PREAMBLE_KEYWORDS.includes(keyword as PreambleType)) {
        push(
          {
            kind: 'preamble',
            type: keyword as PreambleType,
            content: captured.inner,
          },
          i,
          captured.endLine,
        );
      } else {
        // Allocate the block's id *before* lexing its children so ids stay in
        // reading order (the `keyword(` line precedes its inner content).
        const id = ctx.next++;
        const childBaseOffset = baseOffset + lineStart[i] + captured.innerStart;
        const childBaseLine = baseLine + i + captured.innerStartLineOffset;
        const children = tokenizeInto(
          captured.inner,
          ctx,
          childBaseOffset,
          childBaseLine,
        );
        tokens.push({
          kind: 'block-open',
          type: keyword as BlockType,
          raw: captured.inner,
          children,
          id,
          span: spanOf(i, captured.endLine),
        } as Token);
      }
      i = captured.endLine + 1;
      continue;
    }

    // Content-ref definition: key {
    const refMatch = line.match(/^(\w+)\s*\{\s*$/);
    if (refMatch) {
      const captured = captureBalanced(lines, i, '{', '}');
      const id = ctx.next++;
      const childBaseOffset = baseOffset + lineStart[i] + captured.innerStart;
      const childBaseLine = baseLine + i + captured.innerStartLineOffset;
      const children = tokenizeInto(
        captured.inner,
        ctx,
        childBaseOffset,
        childBaseLine,
      );
      tokens.push({
        kind: 'content-ref',
        key: refMatch[1],
        content: captured.inner,
        children,
        id,
        span: spanOf(i, captured.endLine),
      } as Token);
      i = captured.endLine + 1;
      continue;
    }

    // Heading
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      push({ kind: 'heading', level: hMatch[1].length, text: hMatch[2] }, i);
      i++;
      continue;
    }

    // Centered text marker: ^ text
    const cMatch = trimmed.match(/^\^\s+(.+)$/);
    if (cMatch) {
      push({ kind: 'centered-text', content: cMatch[1] }, i);
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
      push({ kind: 'trait-line', traits }, i);
      i++;
      continue;
    }

    // Content reference. A line that's *only* `{{key}}` is its own token so
    // the parser can expand it as a block; inline uses like "Hello {{name}}!"
    // fall through to the text branch and stay literal (references are
    // block-level, defined elsewhere as `key { ... }`).
    const refMatchUse = trimmed.match(/^\{\{(\w+)}}$/);
    if (refMatchUse) {
      push({ kind: 'reference', key: refMatchUse[1] }, i);
      i++;
      continue;
    }

    // List item: * foo or - foo (lone - is hr, handled above)
    if (
      trimmed.startsWith('* ') ||
      (trimmed.startsWith('- ') && trimmed.length > 2)
    ) {
      push({ kind: 'list-item', text: trimmed.slice(2) }, i);
      i++;
      continue;
    }

    // Headerless table: a leading separator/rule row (`|---|---|`) with no
    // header line above it. The rule row still carries per-column alignment;
    // its cell count fixes the column count. A bare `---` (no `|`) isn't a
    // separator row, so it stays plain text and doesn't get swallowed here.
    if (isSeparatorRow(trimmed)) {
      const aligns = parseAligns(trimmed, splitTableRow(trimmed).length);
      push({ kind: 'table-sep', aligns }, i);
      i++;
      i = consumeTableBody(lines, i, push);
      continue;
    }

    // Table: line with `|` and a `---` separator on the next line
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const nextTrim = lines[i + 1].trim();
      if (isSeparatorRow(nextTrim)) {
        const headerCells = splitTableRow(line);
        const aligns = parseAligns(nextTrim, headerCells.length);
        push({ kind: 'table-header', cells: headerCells }, i);
        push({ kind: 'table-sep', aligns }, i + 1);
        i += 2;
        i = consumeTableBody(lines, i, push);
        continue;
      }
    }

    // Default: text
    push({ kind: 'text', content: line }, i);
    i++;
  }

  return tokens;
}

// Emit a token spanning physical lines [startLi..endLi].
type PushFn = (data: TokenData, startLi: number, endLi?: number) => void;

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
  push: PushFn,
): number {
  let i = start;
  while (i < lines.length) {
    const t = lines[i].trim();
    const fn = matchFootnote(t);
    if (fn) {
      push({ kind: 'table-footnote', marker: fn.marker, text: fn.text }, i);
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
    push({ kind: 'table-row', cells: splitTableRow(lines[i]) }, i);
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

// Capture a delimiter-balanced block starting on `startLine`. Returns the
// trimmed inner content, the last line consumed, and where the *trimmed* inner
// begins relative to `startLine` — `innerStart` as a character offset into the
// line-`startLine`-based block, and `innerStartLineOffset` as a line delta —
// so the caller can give the re-lexed children absolute, composable spans.
function captureBalanced(
  lines: string[],
  startLine: number,
  open: string,
  close: string,
): {
  inner: string;
  endLine: number;
  innerStart: number;
  innerStartLineOffset: number;
} {
  const locate = (block: string, closeIdx: number, endLine: number) => {
    const openIdx = block.indexOf(open);
    const rawInner =
      closeIdx >= 0
        ? block.slice(openIdx + 1, closeIdx)
        : block.slice(openIdx + 1);
    const leadingWs = rawInner.length - rawInner.trimStart().length;
    const innerStart = openIdx + 1 + leadingWs;
    const before = block.slice(0, innerStart);
    let newlines = 0;
    for (const ch of before) if (ch === '\n') newlines++;
    return {
      inner: rawInner.trim(),
      endLine,
      innerStart,
      innerStartLineOffset: newlines,
    };
  };

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
          return locate(block, block.lastIndexOf(close), li);
        }
      }
    }
  }
  // Unbalanced — take everything after the open delimiter.
  const block = lines.slice(startLine).join('\n');
  const openIdx = block.indexOf(open);
  if (openIdx < 0) {
    return {
      inner: block,
      endLine: lines.length - 1,
      innerStart: 0,
      innerStartLineOffset: 0,
    };
  }
  return locate(block, -1, lines.length - 1);
}
