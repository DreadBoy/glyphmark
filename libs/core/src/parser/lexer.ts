import type { TokenId, TokenSpan } from './ir';

/**
 * A range within a token's own line: `[start, end)`, counted from column 0 of
 * that line including any indentation.
 *
 * Recognition reports *where* a part of the line is rather than handing back a
 * cleaned-up copy of it. That keeps normalization — trimming, splitting — with
 * the parser, and it is what lets an editor colour a heading's `#` differently
 * from its text, which a pre-extracted string cannot support.
 *
 * Add the token's `span.startOffset` to get an absolute document offset.
 */
export type Part = { start: number; end: number };

// The intrinsic data of a token, before provenance metadata is attached. Kept
// separate so the lexer can stamp `id`/`span`/`raw` onto every variant in one
// place.
//
// Every token covers exactly one physical line, and every line produces exactly
// one token: the stream tiles the source with no gaps and no overlaps. Nesting
// is not represented here — `block-open`/`block-close` and `ref-open`/`ref-close`
// are peers in the stream, and matching them up is the parser's job.
type TokenData =
  // `keyword(` — the opening line of a block or a preamble. Which of the two it
  // is depends on the keyword, and that is a question about meaning, so the
  // lexer locates the keyword and lets the parser read it.
  | { kind: 'block-open'; keyword: Part }
  | { kind: 'block-close' }
  // `keyword(...)` opened and closed on one line, e.g. `rule()`. A separate kind
  // rather than a synthetic open/close pair, because one line is one token.
  | { kind: 'block-inline'; keyword: Part; inner: Part }
  | { kind: 'ref-open'; key: Part }
  | { kind: 'ref-close' }
  | { kind: 'hidden-delimiter' }
  | { kind: 'page-break' }
  | { kind: 'column-break' }
  | { kind: 'full-width-toggle' }
  | { kind: 'hr' }
  // `level` is how many `#` there are — a property of the marker, not a verdict
  // on whether that many is allowed.
  | { kind: 'heading'; level: number; content: Part }
  | { kind: 'centered-text'; content: Part }
  // Any line carrying a `|`, and nothing more said about it. Whether it is a
  // header, a data row, or the rule between them is a question about the lines
  // around it — and telling a rule from a row means reading the dashes, which
  // is interpretation. Both stay with the parser.
  | { kind: 'pipe-line' }
  | { kind: 'footnote-line'; marker: Part; content: Part }
  | { kind: 'list-item'; content: Part }
  // No `traits` list: splitting on commas and deciding what an empty entry
  // means are the parser's calls.
  | { kind: 'trait-line' }
  | { kind: 'reference'; key: Part }
  | { kind: 'text' }
  | { kind: 'blank' };

// Provenance every token carries: an opaque parse-scoped `id` (see
// {@link TokenId}), the token's absolute source `span`, and `raw` — the line
// exactly as written, indentation and trailing spaces included. Every payload
// is a {@link Part} into `raw`, so nothing is lost and nothing is cleaned up.
type TokenMeta = { id: TokenId; span: TokenSpan; raw: string };

// Distribute `& TokenMeta` across each union member so `Token` stays a
// discriminated union (a plain `TokenData & TokenMeta` intersection would break
// `Extract<Token, { kind: '…' }>` narrowing used by the parser).
type WithMeta<T> = T extends unknown ? T & TokenMeta : never;

export type Token = WithMeta<TokenData>;

/** The source text of one of a token's parts, exactly as written. */
export function partText(tok: Token, part: Part): string {
  return tok.raw.slice(part.start, part.end);
}

// Which words are keywords is a lexical fact — it is what distinguishes
// `item(` from prose that happens to end in a paren. What each keyword *means*
// is not: whether `css` introduces a preamble or a container is a question the
// parser answers, so the lexer locates the word and stops there.
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
 * Line recognition only. The lexer answers "what does this line look like, and
 * where are its parts?" and nothing else: it does not pair delimiters, decide
 * whether a run of lines is a table, trim anything, or reject constructs that
 * are invalid where they appear. Those are all questions about a line's
 * surroundings or about meaning, which makes them the parser's.
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
    raw: line,
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

/** What an inline run of markup is, before anything decides what it means. */
export type InlineKind =
  | 'strong'
  | 'em'
  | 'strong-em'
  | 'sup'
  | 'sub'
  | 'action';

/**
 * One run of inline markup, located within the text it was found in.
 *
 * `start`/`end` cover the whole run including its delimiters — what an editor
 * needs to know it may not colour halfway through one. `contentStart`/
 * `contentEnd` cover just the enclosed text, which is what carries meaning. For
 * an action symbol the two coincide: the symbol is the content.
 */
export type InlineSpan = {
  kind: InlineKind;
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
};

// Longest first so `:aaa:` matches before `:aa:` before `:a:`.
const ACTION_TOKENS: readonly string[] = [':aaa:', ':aa:', ':a:', ':r:', ':f:'];

/**
 * Emphasis delimiters, longest run first. Order matters: `***`/`___` are tried
 * before `**`/`*` so a triple run binds as combined bold+italic rather than a
 * strong immediately followed by an em. The delimiter is the same on both ends.
 *
 * NOTE: if strikethrough (`~~...~~`) is ever added, it must come *before* the
 * `~` entry, exactly as `**` precedes `*`.
 */
const EMPHASIS: readonly { delim: string; kind: InlineKind }[] = [
  { delim: '***', kind: 'strong-em' },
  { delim: '___', kind: 'strong-em' },
  { delim: '**', kind: 'strong' },
  { delim: '__', kind: 'strong' },
  { delim: '*', kind: 'em' },
  { delim: '_', kind: 'em' },
  // Superscript/subscript (Pandoc-native `^sup^`, `~sub~`). Single-char, so no
  // prefix overlap with the runs above — array position is irrelevant here. The
  // line-level `^ ` centered marker is caret+space and is recognized before
  // this ever runs, so it never collides with inline `^...^`.
  { delim: '^', kind: 'sup' },
  { delim: '~', kind: 'sub' },
];

/**
 * Locate the inline markup in a line's text.
 *
 * Recognizes `***bi***`/`___bi___`, `**bold**`/`__bold__`, `*italic*`/`_italic_`,
 * `^sup^`, `~sub~`, and the action symbols `:a:`, `:aa:`, `:aaa:`, `:r:`, `:f:`.
 *
 * Delimiters are balanced on the same string and matched greedily, longest run
 * first. There is no arbitrary nesting — `**bold *italic* bold**` keeps the
 * inner `*`s literal; combined bold and italic is only expressed with the triple
 * form. No escapes. Unbalanced delimiters and empty spans (`****`, `^^`, `~~`)
 * are not runs at all, so they simply do not appear here and stay literal.
 *
 * Returns the runs in order, non-overlapping. Everything between them is plain
 * text; this deliberately does not say so, because "the rest is prose" is a
 * reading of the line rather than something found in it.
 *
 * Offsets are relative to `input`. Callers holding a {@link Part} add that
 * part's `start` to place a run within the line.
 */
export function scanInline(input: string): InlineSpan[] {
  const out: InlineSpan[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] === ':') {
      // Plain for-of (mirroring the EMPHASIS loop below) rather than
      // `.find(t => input.startsWith(t, i))` so the callback doesn't close over
      // the mutating loop index `i`.
      let match: string | undefined;
      for (const t of ACTION_TOKENS) {
        if (input.startsWith(t, i)) {
          match = t;
          break;
        }
      }
      if (match) {
        out.push({
          kind: 'action',
          start: i,
          end: i + match.length,
          contentStart: i,
          contentEnd: i + match.length,
        });
        i += match.length;
        continue;
      }
    }

    let matched = false;
    for (const { delim, kind } of EMPHASIS) {
      if (!input.startsWith(delim, i)) continue;
      const close = input.indexOf(delim, i + delim.length);
      // Require a closing delimiter with at least one character between the
      // two, otherwise fall through to a shorter delimiter (or literal text).
      if (close <= i + delim.length) continue;
      out.push({
        kind,
        start: i,
        end: close + delim.length,
        contentStart: i + delim.length,
        contentEnd: close,
      });
      i = close + delim.length;
      matched = true;
      break;
    }
    if (matched) continue;

    i++;
  }

  return out;
}

/**
 * Classify one physical line and locate its parts. Pure: same line in, same
 * token data out, regardless of position in the document.
 */
function recognize(line: string): TokenData {
  const trimmed = line.trim();

  if (trimmed === '') return { kind: 'blank' };

  // Every pattern below is matched against the trimmed line, so part offsets
  // are shifted back by the indentation to land in the raw line.
  const indent = line.length - line.trimStart().length;
  const at = (start: number, end: number): Part => ({
    start: indent + start,
    end: indent + end,
  });
  // Patterns ending in `(.+)$` capture through the end of the trimmed line, so
  // the capture's length locates where it began.
  const tail = (capture: string): Part =>
    at(trimmed.length - capture.length, trimmed.length);

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
  if (openMatch)
    return { kind: 'block-open', keyword: at(0, openMatch[1].length) };

  const inlineMatch = trimmed.match(BLOCK_INLINE_RE);
  if (inlineMatch)
    return {
      kind: 'block-inline',
      keyword: at(0, inlineMatch[1].length),
      // Between the parens: the opener is the first `(`, and the closer is the
      // last character, since the pattern anchors it to the line's end.
      inner: at(trimmed.indexOf('(') + 1, trimmed.length - 1),
    };

  const refMatch = line.match(REF_OPEN_RE);
  if (refMatch)
    return { kind: 'ref-open', key: { start: 0, end: refMatch[1].length } };

  // Heading level is deliberately unbounded here. Which levels a document may
  // use is a language rule, and the parser already owns it — capping at `#{1,6}`
  // during recognition only meant `####### x` silently lexed as prose.
  const hMatch = trimmed.match(HEADING_RE);
  if (hMatch)
    return {
      kind: 'heading',
      level: hMatch[1].length,
      content: tail(hMatch[2]),
    };

  const cMatch = trimmed.match(CENTERED_RE);
  if (cMatch) return { kind: 'centered-text', content: tail(cMatch[1]) };

  if (trimmed.startsWith(';')) return { kind: 'trait-line' };

  // A line that is *only* `{{key}}` is its own token so the parser can expand it
  // as a block; inline uses like "Hello {{name}}!" fall through to text and stay
  // literal (references are block-level, defined elsewhere as `key { ... }`).
  const refUse = trimmed.match(REFERENCE_RE);
  if (refUse) return { kind: 'reference', key: at(2, trimmed.length - 2) };

  if (
    trimmed.startsWith('* ') ||
    (trimmed.startsWith('- ') && trimmed.length > 2)
  )
    return { kind: 'list-item', content: at(2, trimmed.length) };

  const fn = trimmed.match(FOOTNOTE_RE);
  if (fn) {
    const markerStart = trimmed.indexOf('[') + 1;
    return {
      kind: 'footnote-line',
      marker: at(markerStart, markerStart + fn[1].length),
      content: tail(fn[2]),
    };
  }

  if (trimmed.includes('|')) return { kind: 'pipe-line' };

  return { kind: 'text' };
}
