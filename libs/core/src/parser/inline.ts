import type { ActionSymbol, Inline } from './ir';

// Longest first so `:aaa:` matches before `:aa:` before `:a:`.
const ACTION_TOKENS: readonly ActionSymbol[] = [
  ':aaa:',
  ':aa:',
  ':a:',
  ':r:',
  ':f:',
];

/**
 * Emphasis delimiters, longest run first. Order matters: `***`/`___` are tried
 * before `**`/`*` so a triple run binds as combined bold+italic rather than a
 * strong immediately followed by an em. Each entry wraps the enclosed text in
 * its inline node(s); the delimiter is the same on both ends (balanced).
 */
const EMPHASIS: readonly {
  delim: string;
  wrap: (children: Inline[]) => Inline;
}[] = [
  {
    delim: '***',
    wrap: (children) => ({
      kind: 'strong',
      children: [{ kind: 'em', children }],
    }),
  },
  {
    delim: '___',
    wrap: (children) => ({
      kind: 'strong',
      children: [{ kind: 'em', children }],
    }),
  },
  { delim: '**', wrap: (children) => ({ kind: 'strong', children }) },
  { delim: '__', wrap: (children) => ({ kind: 'strong', children }) },
  { delim: '*', wrap: (children) => ({ kind: 'em', children }) },
  { delim: '_', wrap: (children) => ({ kind: 'em', children }) },
  // Superscript/subscript (Pandoc-native `^sup^`, `~sub~`). Single-char, so no
  // prefix overlap with the runs above — array position is irrelevant here. The
  // line-level `^ ` centered-formula marker is caret+space and is consumed by
  // the lexer before this runs, so it never collides with inline `^...^`.
  // NOTE: if strikethrough (`~~...~~`) is ever added, it must come *before* this
  // `~` entry, exactly as `**` precedes `*`.
  { delim: '^', wrap: (children) => ({ kind: 'sup', children }) },
  { delim: '~', wrap: (children) => ({ kind: 'sub', children }) },
];

/**
 * Parse a single line of inline emphasis. Recognizes:
 *   `***bi***` and `___bi___`   → strong wrapping em (bold + italic together)
 *   `**bold**` and `__bold__`   → strong
 *   `*italic*` and `_italic_`   → em
 *   `^sup^`                     → superscript
 *   `~sub~`                     → subscript
 *   `:a:`, `:aa:`, `:aaa:`, `:r:`, `:f:` → action symbol
 *
 * Rules: delimiters are balanced on the same string and matched greedily,
 * longest run first. There is no arbitrary nesting — `**bold *italic* bold**`
 * keeps the inner `*`s literal; combined bold+italic is only expressed with the
 * triple form (`***...***`). No escapes. Unbalanced delimiters are emitted as
 * literal text, and empty spans (`****`, `^^`, `~~`) stay literal too.
 */
export function parseInline(input: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf !== '') {
      out.push({ kind: 'text', text: buf });
      buf = '';
    }
  };

  while (i < input.length) {
    if (input[i] === ':') {
      // Plain for-of (mirroring the EMPHASIS loop below) rather than
      // `.find(t => input.startsWith(t, i))` so the callback doesn't close over
      // the mutating loop index `i`.
      let match: ActionSymbol | undefined;
      for (const t of ACTION_TOKENS) {
        if (input.startsWith(t, i)) {
          match = t;
          break;
        }
      }
      if (match) {
        flush();
        out.push({ kind: 'action', symbol: match });
        i += match.length;
        continue;
      }
    }

    let matched = false;
    for (const { delim, wrap } of EMPHASIS) {
      if (!input.startsWith(delim, i)) continue;
      const end = input.indexOf(delim, i + delim.length);
      // Require a closing delimiter with at least one character between the
      // two, otherwise fall through to a shorter delimiter (or literal text).
      if (end <= i + delim.length) continue;
      flush();
      out.push(
        wrap([{ kind: 'text', text: input.slice(i + delim.length, end) }]),
      );
      i = end + delim.length;
      matched = true;
      break;
    }
    if (matched) continue;

    buf += input[i];
    i++;
  }
  flush();
  return out;
}
