import { describe, it, expect } from 'vitest';
import { tokenize } from './lexer';

const lex = tokenize;

describe('tokenize', () => {
  describe('basic line tokens', () => {
    it('emits no tokens for empty input', () => {
      expect(lex('')).toEqual([{ kind: 'blank' }]);
      // empty string split('\n') = [''] → one blank line
    });

    it('emits text for a plain line', () => {
      expect(lex('hello world')).toEqual([
        { kind: 'text', content: 'hello world' },
      ]);
    });

    it('emits blank for an empty line', () => {
      expect(lex('a\n\nb')).toEqual([
        { kind: 'text', content: 'a' },
        { kind: 'blank' },
        { kind: 'text', content: 'b' },
      ]);
    });
  });

  describe('lone-character markers', () => {
    it('lone = is page-break', () => {
      expect(lex('=')).toEqual([{ kind: 'page-break' }]);
    });

    it('lone | is column-break', () => {
      expect(lex('|')).toEqual([{ kind: 'column-break' }]);
    });

    it('lone / is full-width-toggle', () => {
      expect(lex('/')).toEqual([{ kind: 'full-width-toggle' }]);
    });

    it('lone - is hr', () => {
      expect(lex('-')).toEqual([{ kind: 'hr' }]);
    });

    it('lone % is hidden-delimiter', () => {
      expect(lex('%')).toEqual([{ kind: 'hidden-delimiter' }]);
    });

    it('leading whitespace defeats lone markers', () => {
      expect(lex(' =')).toEqual([{ kind: 'text', content: ' =' }]);
      expect(lex(' |')).toEqual([{ kind: 'text', content: ' |' }]);
      expect(lex(' /')).toEqual([{ kind: 'text', content: ' /' }]);
      expect(lex(' -')).toEqual([{ kind: 'text', content: ' -' }]);
      expect(lex(' %')).toEqual([{ kind: 'text', content: ' %' }]);
    });
  });

  describe('headings', () => {
    it('parses h1 through h6', () => {
      for (let n = 1; n <= 6; n++) {
        const hashes = '#'.repeat(n);
        expect(lex(`${hashes} Title`)).toEqual([
          { kind: 'heading', level: n, text: 'Title' },
        ]);
      }
    });

    it('does not match # without space', () => {
      expect(lex('#NotAHeading')).toEqual([
        { kind: 'text', content: '#NotAHeading' },
      ]);
    });
  });

  describe('centered text', () => {
    it('emits centered-text for ^ marker', () => {
      expect(lex('^ centered line')).toEqual([
        { kind: 'centered-text', content: 'centered line' },
      ]);
    });

    it('preserves inline markdown in centered content', () => {
      expect(lex('^ **Damage** equals level × 2')).toEqual([
        { kind: 'centered-text', content: '**Damage** equals level × 2' },
      ]);
    });

    it('does not match ^ without space', () => {
      expect(lex('^centered')).toEqual([
        { kind: 'text', content: '^centered' },
      ]);
    });
  });

  describe('traits', () => {
    it('parses comma-separated traits', () => {
      expect(lex('; uncommon, class, feat')).toEqual([
        { kind: 'trait-line', traits: ['uncommon', 'class', 'feat'] },
      ]);
    });

    it('handles missing space after ;', () => {
      expect(lex(';foo,bar')).toEqual([
        { kind: 'trait-line', traits: ['foo', 'bar'] },
      ]);
    });
  });

  describe('list items', () => {
    it('parses * list item', () => {
      expect(lex('* first')).toEqual([{ kind: 'list-item', text: 'first' }]);
    });

    it('parses - list item with content', () => {
      expect(lex('- second')).toEqual([{ kind: 'list-item', text: 'second' }]);
    });

    it('does not treat lone - as list', () => {
      expect(lex('-')).toEqual([{ kind: 'hr' }]);
    });
  });

  describe('preamble blocks', () => {
    it('parses css', () => {
      expect(lex('css(\n.foo { color: red; }\n)')).toEqual([
        {
          kind: 'preamble',
          type: 'css',
          content: '.foo { color: red; }',
        },
      ]);
    });

    it('parses fonts', () => {
      expect(lex('fonts(\nRoboto:wght@400;700\nOpen Sans\n)')).toEqual([
        {
          kind: 'preamble',
          type: 'fonts',
          content: 'Roboto:wght@400;700\nOpen Sans',
        },
      ]);
    });
  });

  describe('block-open', () => {
    it('emits block-open for each block type', () => {
      const types = [
        'item',
        'info',
        'rule',
        'sample',
        'head',
        'sidebar',
      ] as const;
      for (const t of types) {
        const tokens = lex(`${t}(\nfoo\n)`);
        expect(tokens).toEqual([{ kind: 'block-open', type: t, raw: 'foo' }]);
      }
    });

    it('handles whitespace between keyword and paren', () => {
      expect(lex('item (\nfoo\n)')).toEqual([
        { kind: 'block-open', type: 'item', raw: 'foo' },
      ]);
    });

    it('preserves nested parens inside block content', () => {
      expect(lex('rule(\nSee (page 295) for details\n)')).toEqual([
        {
          kind: 'block-open',
          type: 'rule',
          raw: 'See (page 295) for details',
        },
      ]);
    });

    it('handles content with hr and column-break inside (lexer leaves raw)', () => {
      expect(lex('item(\n# Foo\n-\nA\n|\nB\n)')).toEqual([
        {
          kind: 'block-open',
          type: 'item',
          raw: '# Foo\n-\nA\n|\nB',
        },
      ]);
    });
  });

  describe('content-ref', () => {
    it('captures top-level content-ref definition', () => {
      const tokens = lex('myref {\nHello\n}');
      expect(tokens).toEqual([
        { kind: 'content-ref', key: 'myref', content: 'Hello' },
      ]);
    });

    it('handles nested braces', () => {
      const tokens = lex('myref {\n.foo { color: red; }\n}');
      expect(tokens).toEqual([
        {
          kind: 'content-ref',
          key: 'myref',
          content: '.foo { color: red; }',
        },
      ]);
    });
  });

  describe('tables', () => {
    it('emits header, sep, and rows', () => {
      const tokens = lex('A | B\n--- | ---\n1 | 2');
      expect(tokens).toEqual([
        { kind: 'table-header', cells: ['A', 'B'] },
        { kind: 'table-sep', aligns: ['left', 'left'] },
        { kind: 'table-row', cells: ['1', '2'] },
      ]);
    });

    it('parses center alignment via :---:', () => {
      const tokens = lex('A | B | C\n--- | :---: | ---:\n1 | 2 | 3');
      expect(tokens[1]).toEqual({
        kind: 'table-sep',
        aligns: ['left', 'center', 'right'],
      });
    });

    it('captures unnumbered footnotes after rows', () => {
      const tokens = lex('A | B\n--- | ---\n1 | 2\n. [*] footnote text');
      expect(tokens).toContainEqual({
        kind: 'table-footnote',
        marker: '*',
        text: 'footnote text',
      });
    });

    it('captures numbered footnotes', () => {
      const tokens = lex(
        'A | B\n--- | ---\n1 | 2\n. [1] first note\n. [2] second note',
      );
      const fns = tokens.filter((t) => t.kind === 'table-footnote');
      expect(fns).toEqual([
        { kind: 'table-footnote', marker: '1', text: 'first note' },
        { kind: 'table-footnote', marker: '2', text: 'second note' },
      ]);
    });

    it('captures footnotes after a blank line', () => {
      const tokens = lex('A | B\n--- | ---\n1 | 2\n\n. [*] tail footnote');
      expect(tokens).toContainEqual({
        kind: 'table-footnote',
        marker: '*',
        text: 'tail footnote',
      });
    });

    it('does not treat ` | ` in prose as a table without separator', () => {
      // No `---` line below ⇒ stays as text
      expect(lex('A | B')).toEqual([{ kind: 'text', content: 'A | B' }]);
    });

    it('preserves an empty leading header cell (blank column header)', () => {
      const tokens = lex(
        '| | Price | Bulk |\n|---|:---:|---|\n| Tiny | x1 | 0 |',
      );
      expect(tokens).toEqual([
        { kind: 'table-header', cells: ['', 'Price', 'Bulk'] },
        { kind: 'table-sep', aligns: ['left', 'center', 'left'] },
        { kind: 'table-row', cells: ['Tiny', 'x1', '0'] },
      ]);
    });

    it('strips only border pipes, not interior empty cells', () => {
      // Leading/trailing `|` are borders (no phantom cells); an interior blank
      // between two `|`s is a real empty cell.
      const tokens = lex('a | | c\n---|---|---\nx | y | z');
      expect(tokens[0]).toEqual({
        kind: 'table-header',
        cells: ['a', '', 'c'],
      });
    });

    it('preserves a trailing empty header cell', () => {
      // The cell between the last interior `|` and the border `|` is empty.
      const tokens = lex('| A | B | |\n|---|---|---|\n| x | y | z |');
      expect(tokens[0]).toEqual({
        kind: 'table-header',
        cells: ['A', 'B', ''],
      });
    });

    it('preserves empty headers in leading, middle, and trailing positions', () => {
      const tokens = lex(
        '| | A | | B | |\n|---|---|---|---|---|\n| p | q | r | s | t |',
      );
      expect(tokens[0]).toEqual({
        kind: 'table-header',
        cells: ['', 'A', '', 'B', ''],
      });
    });

    describe('headerless (leading separator)', () => {
      it('starts a table on a lone separator row — no table-header', () => {
        const tokens = lex('|---|---|\n| a | b |\n| c | d |');
        expect(tokens).toEqual([
          { kind: 'table-sep', aligns: ['left', 'left'] },
          { kind: 'table-row', cells: ['a', 'b'] },
          { kind: 'table-row', cells: ['c', 'd'] },
        ]);
      });

      it('honors alignment from the leading separator', () => {
        const tokens = lex('|:---|:---:|---:|\n| a | b | c |');
        expect(tokens[0]).toEqual({
          kind: 'table-sep',
          aligns: ['left', 'center', 'right'],
        });
      });

      it('captures footnotes under a headerless table', () => {
        const tokens = lex('|---|---|\n| a | b[*] |\n. [*] note');
        expect(tokens).toContainEqual({
          kind: 'table-sep',
          aligns: ['left', 'left'],
        });
        expect(tokens).toContainEqual({
          kind: 'table-footnote',
          marker: '*',
          text: 'note',
        });
      });

      it('leaves a bare `---` (no pipe) as text, not a table', () => {
        expect(lex('---\nsome prose')).toEqual([
          { kind: 'text', content: '---' },
          { kind: 'text', content: 'some prose' },
        ]);
      });
    });
  });

  describe('mixed sequences', () => {
    it('lexes a small document', () => {
      const tokens = lex(
        '# Title\n\nIntro paragraph.\n\nitem(\n# Feat\n-\n; trait\nBody\n)',
      );
      expect(tokens).toEqual([
        { kind: 'heading', level: 1, text: 'Title' },
        { kind: 'blank' },
        { kind: 'text', content: 'Intro paragraph.' },
        { kind: 'blank' },
        {
          kind: 'block-open',
          type: 'item',
          raw: '# Feat\n-\n; trait\nBody',
        },
      ]);
    });
  });
});
