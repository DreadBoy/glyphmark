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
 * Parse a single line of inline emphasis. Recognizes:
 *   `**bold**` and `__bold__` → strong
 *   `*italic*` and `_italic_` → em
 *   `:a:`, `:aa:`, `:aaa:`, `:r:`, `:f:` → action symbol
 *
 * Rules: balanced on the same string, no nesting, no escapes.
 * Unbalanced delimiters are emitted as literal text. Strong is tried
 * before em (so `**foo**` becomes strong, not em wrapping a `*foo*`).
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
      const match = ACTION_TOKENS.find((t) => input.startsWith(t, i));
      if (match) {
        flush();
        out.push({ kind: 'action', symbol: match });
        i += match.length;
        continue;
      }
    }
    if (input.startsWith('**', i)) {
      const end = input.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({
          kind: 'strong',
          children: [{ kind: 'text', text: input.slice(i + 2, end) }],
        });
        i = end + 2;
        continue;
      }
    }
    if (input.startsWith('__', i)) {
      const end = input.indexOf('__', i + 2);
      if (end > i + 2) {
        flush();
        out.push({
          kind: 'strong',
          children: [{ kind: 'text', text: input.slice(i + 2, end) }],
        });
        i = end + 2;
        continue;
      }
    }
    if (input[i] === '*') {
      const end = input.indexOf('*', i + 1);
      if (end > i + 1) {
        flush();
        out.push({
          kind: 'em',
          children: [{ kind: 'text', text: input.slice(i + 1, end) }],
        });
        i = end + 1;
        continue;
      }
    }
    if (input[i] === '_') {
      const end = input.indexOf('_', i + 1);
      if (end > i + 1) {
        flush();
        out.push({
          kind: 'em',
          children: [{ kind: 'text', text: input.slice(i + 1, end) }],
        });
        i = end + 1;
        continue;
      }
    }
    buf += input[i]!;
    i++;
  }
  flush();
  return out;
}
