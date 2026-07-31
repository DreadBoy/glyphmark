import { describe, it, expect } from 'vitest';
import { tokenize, buildTokenMap, type Token } from './lexer';

// Most assertions care about what a line was recognized as, not where it sat.
// Provenance has its own block at the bottom.
function stripMeta(tokens: Token[]): Array<Record<string, unknown>> {
  return tokens.map((t) => {
    const rec = { ...t } as Record<string, unknown>;
    delete rec.id;
    delete rec.span;
    return rec;
  });
}
const lex = (s: string) => stripMeta(tokenize(s));
const kinds = (s: string) => tokenize(s).map((t) => t.kind);

describe('tokenize — the stream tiles the source', () => {
  // The lexer's central contract, and the one an incremental IDE lexer depends
  // on: every line produces exactly one token, in order, covering every
  // character with no gaps and no overlaps.
  const samples = [
    '',
    'plain prose',
    'a\n\nb',
    'item(\n# Name\n-\nBody\n)',
    'A|B\n---|---\n1|2\n\n. [*] note',
    'key {\nInside\n}\n\n{{key}}',
    'css(\n.foo { color: red; }\n)',
  ];

  it.each(samples)('one token per line: %j', (src) => {
    expect(tokenize(src)).toHaveLength(src.split('\n').length);
  });

  it.each(samples)('spans cover every character exactly once: %j', (src) => {
    const tokens = tokenize(src);
    let cursor = 0;
    for (const t of tokens) {
      expect(t.span.startOffset).toBe(cursor);
      expect(src.slice(t.span.startOffset, t.span.endOffset)).not.toContain(
        '\n',
      );
      // +1 for the newline that split() removed; the last line has none.
      cursor = t.span.endOffset + 1;
    }
    expect(cursor).toBe(src.length + 1);
  });

  it('recognizes a line the same way regardless of position', () => {
    // Recognition is a pure function of the line, so the same text lexes
    // identically at the top of a document and buried inside a block.
    const alone = lex('* bullet')[0];
    const nested = lex('item(\nrule(\n* bullet\n)\n)')[2];
    expect(nested).toEqual(alone);
  });
});

describe('tokenize — line shapes', () => {
  it('emits one blank for empty input', () => {
    // `''.split('\n')` is `['']` — one empty line, so one blank token.
    expect(lex('')).toEqual([{ kind: 'blank' }]);
  });

  it('emits text for a plain line, preserving it verbatim', () => {
    expect(lex('  hello world  ')).toEqual([
      { kind: 'text', content: '  hello world  ' },
    ]);
  });

  it.each([
    ['%', 'hidden-delimiter'],
    ['=', 'page-break'],
    ['|', 'column-break'],
    ['/', 'full-width-toggle'],
    ['-', 'hr'],
    [')', 'block-close'],
    ['}', 'ref-close'],
  ])('lone %s is %s', (line, kind) => {
    expect(kinds(line)).toEqual([kind]);
  });

  it('leading whitespace defeats lone markers', () => {
    expect(kinds(' =')).toEqual(['text']);
    expect(kinds(' -')).toEqual(['text']);
  });

  it('parses headings at any depth', () => {
    // The level cap is a language rule the parser owns; recognition does not
    // second-guess it, so `#######` is a heading here and rejected later.
    expect(lex('# One\n####### Seven')).toEqual([
      { kind: 'heading', level: 1, text: 'One' },
      { kind: 'heading', level: 7, text: 'Seven' },
    ]);
  });

  it('does not match # or ^ without a space', () => {
    expect(kinds('#nope')).toEqual(['text']);
    expect(kinds('^nope')).toEqual(['text']);
  });

  it('emits centered-text for the ^ marker', () => {
    expect(lex('^ centered')).toEqual([
      { kind: 'centered-text', content: 'centered' },
    ]);
  });

  it('recognizes a trait line without splitting it', () => {
    // Which traits the line lists — and whether an empty entry counts — is the
    // parser's reading of it.
    expect(lex(';alpha, beta')).toEqual([
      { kind: 'trait-line', raw: ';alpha, beta' },
    ]);
  });

  it('parses list items, but not a lone dash', () => {
    expect(lex('* one\n- two\n-')).toEqual([
      { kind: 'list-item', text: 'one' },
      { kind: 'list-item', text: 'two' },
      { kind: 'hr' },
    ]);
  });

  it('emits a reference only for a line that is exactly {{key}}', () => {
    expect(kinds('{{key}}')).toEqual(['reference']);
    expect(kinds('Hello {{key}}!')).toEqual(['text']);
  });
});

describe('tokenize — delimiters', () => {
  it.each(['item', 'info', 'rule', 'sample', 'head', 'css', 'fonts'])(
    'emits block-open for %s(',
    (keyword) => {
      expect(lex(`${keyword}(`)).toEqual([{ kind: 'block-open', keyword }]);
    },
  );

  it('allows whitespace between keyword and paren', () => {
    expect(lex('item (')).toEqual([{ kind: 'block-open', keyword: 'item' }]);
  });

  it('emits open and close as peers, without pairing them', () => {
    // Nesting is the parser's job; the lexer just reports each line.
    expect(kinds('item(\nrule(\nx\n)\n)')).toEqual([
      'block-open',
      'block-open',
      'text',
      'block-close',
      'block-close',
    ]);
  });

  it('emits block-inline for a block opened and closed on one line', () => {
    expect(lex('rule()')).toEqual([
      { kind: 'block-inline', keyword: 'rule', inner: '' },
    ]);
    expect(lex('rule(text)')).toEqual([
      { kind: 'block-inline', keyword: 'rule', inner: 'text' },
    ]);
  });

  it('emits ref-open and ref-close for a definition', () => {
    expect(lex('key {\nInside\n}')).toEqual([
      { kind: 'ref-open', key: 'key' },
      { kind: 'text', content: 'Inside' },
      { kind: 'ref-close' },
    ]);
  });

  it('does not report an unterminated block any differently', () => {
    // Whether a block ever closes is a question about the rest of the document,
    // so the lexer stays silent and the parser decides. What matters is that
    // nothing is swallowed: the lines after the opener are still their own
    // tokens, which is what the old tree-building lexer lost.
    expect(kinds('item(\n# Foo\nbody')).toEqual([
      'block-open',
      'heading',
      'text',
    ]);
  });

  it('does not let a stray paren in prose consume anything', () => {
    expect(kinds('rule(\nsmiley :) here\nmore\n)')).toEqual([
      'block-open',
      'text',
      'text',
      'block-close',
    ]);
    // The prose line survives intact, parenthesis and all.
    expect(lex('rule(\nsmiley :) here\n)')[1]).toEqual({
      kind: 'text',
      content: 'smiley :) here',
    });
  });
});

describe('tokenize — context-dependent shapes', () => {
  // These three are reported on appearance alone. Whether they form a table is
  // decided by the parser, so the lexer emits the same token either way.
  it('emits pipe-line for any line with a pipe, carrying only the line', () => {
    // Which cells the line holds is a decomposition the parser does; the lexer
    // reports only that the line is pipe-shaped.
    expect(lex('A|B')).toEqual([{ kind: 'pipe-line', raw: 'A|B' }]);
  });

  it('emits the same pipe-line whether or not a table follows', () => {
    const inTable = lex('A|B\n---|---\n1|2')[0];
    const inProse = lex('A|B\njust prose')[0];
    expect(inTable).toEqual(inProse);
  });

  it('does not distinguish a column rule from a row', () => {
    // Both are lines with pipes. Telling them apart means reading the cells
    // for dashes and colons, which is interpretation — so the parser does it
    // and the lexer emits one kind for both.
    expect(lex('---|:---:')).toEqual([{ kind: 'pipe-line', raw: '---|:---:' }]);
    expect(lex('A|B')).toEqual([{ kind: 'pipe-line', raw: 'A|B' }]);
  });

  it('keeps a bare --- as prose — no pipe, so nothing to be a row of', () => {
    expect(kinds('---')).toEqual(['text']);
  });

  it('emits footnote-line for a bracketed marker line', () => {
    expect(lex('. [*] note')).toEqual([
      { kind: 'footnote-line', marker: '*', text: 'note', raw: '. [*] note' },
    ]);
    expect(kinds('. [3] note')).toEqual(['footnote-line']);
  });

  it('keeps the raw line so a non-table use can recover it', () => {
    const [tok] = tokenize('| a | b |');
    expect(tok.kind === 'pipe-line' && tok.raw).toBe('| a | b |');
  });

  it('leaves indentation and spacing in raw untouched', () => {
    expect(lex('  A |  B  ')).toEqual([
      { kind: 'pipe-line', raw: '  A |  B  ' },
    ]);
  });

  it('emits a blank inside a would-be table body like anywhere else', () => {
    // The old lexer swallowed this line to keep a table open across the gap,
    // leaving a hole in the stream.
    expect(kinds('A|B\n---|---\n1|2\n\n. [*] note')).toEqual([
      'pipe-line',
      'pipe-line',
      'pipe-line',
      'blank',
      'footnote-line',
    ]);
  });

  it('does not reinterpret a lone pipe after a row', () => {
    // `|` on its own is a column break wherever it appears.
    expect(kinds('A|B\n---|---\n1|2\n|')).toEqual([
      'pipe-line',
      'pipe-line',
      'pipe-line',
      'column-break',
    ]);
  });
});

describe('tokenize — provenance', () => {
  it('assigns ids in reading order', () => {
    const tokens = tokenize('# H\nbody\nitem(\nx\n)');
    expect(tokens.map((t) => t.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it('records 1-based lines and absolute offsets', () => {
    const src = '# Title\n\nBody text';
    const [heading, blank, body] = tokenize(src);
    expect(heading.span).toEqual({
      startLine: 1,
      endLine: 1,
      startOffset: 0,
      endOffset: 7,
    });
    expect(blank.span.startLine).toBe(2);
    expect(body.span).toEqual({
      startLine: 3,
      endLine: 3,
      startOffset: 9,
      endOffset: 18,
    });
    expect(src.slice(body.span.startOffset, body.span.endOffset)).toBe(
      'Body text',
    );
  });

  it('gives every token a single-line span', () => {
    // Nothing spans multiple lines any more — a block's extent is derived by
    // the parser from its opener and closer.
    for (const t of tokenize('item(\n# Name\n-\nBody\n)')) {
      expect(t.span.startLine).toBe(t.span.endLine);
    }
  });

  it('buildTokenMap resolves every token', () => {
    const tokens = tokenize('item(\n# Name\n-\nBody\n)');
    const map = buildTokenMap(tokens);
    expect(map.size).toBe(tokens.length);
    for (const t of tokens) expect(map.get(t.id)).toEqual(t.span);
  });
});
