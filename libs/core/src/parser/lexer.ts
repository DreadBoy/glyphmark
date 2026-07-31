import type { TokenId, TokenSpan } from './ir';

// The intrinsic data of a token, before provenance metadata is attached. Kept
// separate so the lexer can stamp `id`/`span` onto every variant in one place.
//
// Every token covers exactly one physical line, and every line produces exactly
// one token: the stream tiles the source with no gaps and no overlaps. Nesting
// is not represented here — `block-open`/`block-close` and `ref-open`/`ref-close`
// are peers in the stream, and matching them up is the parser's job.
type TokenData =
  // `keyword(` — the opening line of a block or a preamble. Which of the two it
  // is depends on the keyword, and that is a question about meaning, so the
  // lexer records the keyword verbatim and lets the parser decide.
  | { kind: 'block-open'; keyword: string }
  | { kind: 'block-close' }
  // `keyword(...)` opened and closed on one line, e.g. `rule()`. A separate kind
  // rather than a synthetic open/close pair, because one line is one token.
  | { kind: 'block-inline'; keyword: string; inner: string }
  | { kind: 'ref-open'; key: string }
  | { kind: 'ref-close' }
  | { kind: 'hidden-delimiter' }
  | { kind: 'page-break' }
  | { kind: 'column-break' }
  | { kind: 'full-width-toggle' }
  | { kind: 'hr' }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'centered-text'; content: string }
  // Any line carrying a `|`, and nothing more said about it. Whether it is a
  // header, a data row, or the rule between them is a question about the lines
  // around it — and telling a rule from a row means reading the dashes, which
  // is interpretation. Both stay with the parser.
  | { kind: 'pipe-line'; raw: string }
  // `marker`/`text` are the groups its own recognizer captured, not an
  // interpretation: there is no way to know this line is footnote-shaped
  // without capturing them.
  | { kind: 'footnote-line'; marker: string; text: string; raw: string }
  | { kind: 'list-item'; text: string }
  // Carries the line, not a trait list: splitting on commas, trimming, and
  // deciding what an empty entry means are all the parser's calls.
  | { kind: 'trait-line'; raw: string }
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

// Which words are keywords is a lexical fact — it is what distinguishes
// `item(` from prose that happens to end in a paren. What each keyword *means*
// is not: whether `css` introduces a preamble or a container is a question the
// parser answers, so the lexer records the word verbatim and stops there.
const KEYWORD = 'item|info|rule|sample|head|css|fonts';
const BLOCK_OPEN_RE = new RegExp(`^(${KEYWORD})\\s*\\($`);
const BLOCK_INLINE_RE = new RegExp(`^(${KEYWORD})\\s*\\((.*)\\)$`);
const REF_OPEN_RE = /^(\w+)\s*\{$/;
const HEADING_RE = /^(#+)\s+(.+)$/;
const CENTERED_RE = /^\^\s+(.+)$/;
const REFERENCE_RE = /^\{\{(\w+)}}$/;

// Footnote line: `. [<marker>] <text>` where marker is `*` (unnumbered) or one
// or more digits. Anchored to the start of the trimmed line so prose dots don't
// masquerade as footnotes.
const FOOTNOTE_RE = /^\.\s*\[(\*|\d+)]\s+(.+)$/;

/**
 * Tokenize a `.glyph` document into a flat stream, one token per physical line.
 *
 * Every token carries a parse-scoped `id` and an absolute source `span`. Ids are
 * unique per call and allocated in reading order, but treat them as opaque —
 * resolve them against the map from {@link buildTokenMap} (or
 * `GlyphDocument.tokenMap`) of the *same* lex.
 *
 * Line recognition only. The lexer answers "what does this line look like?" and
 * nothing else: it does not pair delimiters, decide whether a run of lines is a
 * table, or reject constructs that are invalid where they appear. Those are all
 * questions about a line's surroundings, which makes them the parser's.
 */
export function tokenize(input: string): Token[] {
  const lines = input.split('\n');

  // Absolute start offset of each line (column 0). One pass up front, so
  // recognizing a line never needs to know what came before it.
  const lineStart: number[] = [];
  {
    let acc = 0;
    for (const line of lines) {
      lineStart.push(acc);
      acc += line.length + 1; // +1 for the '\n' that split() removed
    }
  }

  return lines.map((line, i) => ({
    ...recognize(line),
    id: i,
    span: {
      startLine: i + 1,
      endLine: i + 1,
      startOffset: lineStart[i],
      endOffset: lineStart[i] + line.length,
    },
  })) as Token[];
}

/**
 * Build a `TokenId → span` lookup.
 *
 * Kept as a function (rather than callers indexing the array directly) because
 * ids are documented as opaque handles; the map is the sanctioned way to resolve
 * one, and it stays correct if ids ever stop being array indices.
 */
export function buildTokenMap(tokens: Token[]): Map<TokenId, TokenSpan> {
  return new Map(tokens.map((t) => [t.id, t.span]));
}

/**
 * Classify one physical line. Pure: same line in, same token data out,
 * regardless of position in the document.
 */
function recognize(line: string): TokenData {
  const trimmed = line.trim();

  if (trimmed === '') return { kind: 'blank' };

  // Lone-marker lines require no leading whitespace.
  switch (line) {
    case '%':
      return { kind: 'hidden-delimiter' };
    case '=':
      return { kind: 'page-break' };
    case '|':
      return { kind: 'column-break' };
    case '/':
      return { kind: 'full-width-toggle' };
    case '-':
      return { kind: 'hr' };
    case ')':
      return { kind: 'block-close' };
    case '}':
      return { kind: 'ref-close' };
  }

  const openMatch = trimmed.match(BLOCK_OPEN_RE);
  if (openMatch) return { kind: 'block-open', keyword: openMatch[1] };

  const inlineMatch = trimmed.match(BLOCK_INLINE_RE);
  if (inlineMatch)
    return {
      kind: 'block-inline',
      keyword: inlineMatch[1],
      inner: inlineMatch[2],
    };

  const refMatch = line.match(REF_OPEN_RE);
  if (refMatch) return { kind: 'ref-open', key: refMatch[1] };

  // Heading level is deliberately unbounded here. Which levels a document may
  // use is a language rule, and the parser already owns it — capping at `#{1,6}`
  // during recognition only meant `####### x` silently lexed as prose.
  const hMatch = trimmed.match(HEADING_RE);
  if (hMatch)
    return { kind: 'heading', level: hMatch[1].length, text: hMatch[2] };

  const cMatch = trimmed.match(CENTERED_RE);
  if (cMatch) return { kind: 'centered-text', content: cMatch[1] };

  if (trimmed.startsWith(';')) return { kind: 'trait-line', raw: line };

  // A line that is *only* `{{key}}` is its own token so the parser can expand it
  // as a block; inline uses like "Hello {{name}}!" fall through to text and stay
  // literal (references are block-level, defined elsewhere as `key { ... }`).
  const refUse = trimmed.match(REFERENCE_RE);
  if (refUse) return { kind: 'reference', key: refUse[1] };

  if (
    trimmed.startsWith('* ') ||
    (trimmed.startsWith('- ') && trimmed.length > 2)
  )
    return { kind: 'list-item', text: trimmed.slice(2) };

  const fn = trimmed.match(FOOTNOTE_RE);
  if (fn)
    return { kind: 'footnote-line', marker: fn[1], text: fn[2], raw: line };

  if (trimmed.includes('|')) return { kind: 'pipe-line', raw: line };

  return { kind: 'text', content: line };
}
