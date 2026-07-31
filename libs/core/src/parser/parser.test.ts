import { describe, it, expect, vi } from 'vitest';
import {
  ALLOWED_SEGMENTS,
  MAX_HEADING_LEVEL,
  parse,
  parseInline,
} from './parser';
import type { DiagnosticCode, GlyphDocument, Origin } from './ir';

describe('parse — preamble', () => {
  it('extracts custom CSS', () => {
    const doc = parse('css(\n.foo { color: red; }\n)\n\nBody');
    expect(doc.customCss).toBe('.foo { color: red; }');
  });

  it('concatenates multiple css blocks', () => {
    const doc = parse('css(\n.a {}\n)\n\ncss(\n.b {}\n)');
    expect(doc.customCss).toBe('.a {}\n.b {}');
  });

  it('extracts fonts as one entry per line', () => {
    const doc = parse('fonts(\nRoboto\nOpen Sans\n)');
    expect(doc.fonts).toEqual(['Roboto', 'Open Sans']);
  });
});

describe('parse — content references', () => {
  it('extracts content-ref definitions as pre-parsed body nodes', () => {
    const doc = parse('myref {\nHello world\n}\n\nBody');
    const nodes = doc.contentRefs.get('myref');
    expect(nodes).toHaveLength(1);
    const [node] = nodes ?? [];
    expect(node?.type).toBe('paragraph');
    if (node?.type === 'paragraph') {
      expect(node.content).toEqual([{ kind: 'text', text: 'Hello world' }]);
    }
  });

  it('strips definitions from body', () => {
    const doc = parse('myref {\nHello\n}\n\nVisible text');
    const para = doc.body.find((n) => n.type === 'paragraph');
    expect(para?.type).toBe('paragraph');
    if (para?.type === 'paragraph') {
      expect(para.content).toEqual([{ kind: 'text', text: 'Visible text' }]);
    }
  });

  it('extracts refs from hidden section', () => {
    const doc = parse(
      'Visible\n\n%\n\nsecret {\nrule(\n# Hidden\nContent\n)\n}',
    );
    expect(doc.contentRefs.has('secret')).toBe(true);
  });

  it('expands a standalone {{key}} paragraph to the ref content', () => {
    const doc = parse('myref {\nHi\n}\n\n{{myref}}');
    const para = doc.body.find((n) => n.type === 'paragraph');
    expect(para?.type).toBe('paragraph');
    if (para?.type === 'paragraph') {
      expect(para.content).toEqual([{ kind: 'text', text: 'Hi' }]);
    }
  });

  it('keeps {{key}} literal when used inline inside a paragraph', () => {
    const doc = parse('name {\nWorld\n}\n\nHello {{name}}!');
    const para = doc.body.find((n) => n.type === 'paragraph');
    if (para?.type === 'paragraph') {
      expect(para.content).toEqual([{ kind: 'text', text: 'Hello {{name}}!' }]);
    }
  });

  it('keeps unknown {{key}} references as literal text', () => {
    const doc = parse('{{unknown}}');
    const para = doc.body.find((n) => n.type === 'paragraph');
    if (para?.type === 'paragraph') {
      expect(para.content).toEqual([{ kind: 'text', text: '{{unknown}}' }]);
    }
  });

  it('expands a standalone reference into a block', () => {
    const doc = parse(
      'sidebar {\nrule(\n# Title\nBody.\n)\n}\n\nIntro.\n\n{{sidebar}}',
    );
    const rule = doc.body.find((n) => n.type === 'rule');
    expect(rule?.type).toBe('rule');
    if (rule?.type === 'rule') {
      const heading = rule.content[0];
      expect(heading?.kind).toBe('heading');
      if (heading?.kind === 'heading') {
        expect(heading.content).toEqual([{ kind: 'text', text: 'Title' }]);
      }
    }
  });

  it('expands two adjacent reference-only lines independently', () => {
    const doc = parse('a {\nA\n}\n\nb {\nB\n}\n\n{{a}}\n{{b}}');
    const paras = doc.body.filter((n) => n.type === 'paragraph');
    expect(paras).toHaveLength(2);
    if (paras[0]?.type === 'paragraph' && paras[1]?.type === 'paragraph') {
      expect(paras[0].content).toEqual([{ kind: 'text', text: 'A' }]);
      expect(paras[1].content).toEqual([{ kind: 'text', text: 'B' }]);
    }
  });

  it('does not nest: references inside a definition stay literal', () => {
    const doc = parse('a {\n{{b}}\n}\n\nb {\nworld\n}\n\n{{a}}');
    const para = doc.body.find((n) => n.type === 'paragraph');
    expect(para?.type).toBe('paragraph');
    if (para?.type === 'paragraph') {
      expect(para.content).toEqual([{ kind: 'text', text: '{{b}}' }]);
    }
  });

  it('warns when a definition contains a non-Node-level construct', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // A trait line (`;...`) is only valid inside an item block — at the body
    // level (which is what a ref definition is) it's invalid and dropped.
    parse('bad {\n;trait\n}');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('trait line'));
    warn.mockRestore();
  });

  it('warns and ignores a definition nested inside a block', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = parse('rule(\nmyref {\nInside\n}\n)');
    expect(doc.contentRefs.has('myref')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('must live at the body level'),
    );
    warn.mockRestore();
  });
});

describe('parse — markers', () => {
  it('parses page break', () => {
    const doc = parse('A\n\n=\n\nB');
    expect(doc.body.some((n) => n.type === 'page-break')).toBe(true);
  });

  it('parses column break', () => {
    const doc = parse('A\n\n|\n\nB');
    expect(doc.body.some((n) => n.type === 'column-break')).toBe(true);
  });

  it('parses full-width-toggle and numbers each occurrence', () => {
    const doc = parse('A\n\n/\n\nB\n\n/\n\nC');
    const toggles = doc.body.filter((n) => n.type === 'full-width-toggle');
    // toMatchObject tolerates the added `origin` field on each node.
    expect(toggles).toMatchObject([
      { type: 'full-width-toggle', index: 1 },
      { type: 'full-width-toggle', index: 2 },
    ]);
  });

  it('warns and skips top-level lone -', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = parse('A\n\n-\n\nB');
    expect(
      doc.body.some(
        (n) =>
          n.type === 'paragraph' &&
          n.content[0]?.kind === 'text' &&
          n.content[0].text === 'A',
      ),
    ).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('top-level hr'));
    warn.mockRestore();
  });
});

describe('parse — headings and lists', () => {
  it('parses h1 with inline emphasis', () => {
    const doc = parse('# *Subsist* (Untrained)');
    const h = doc.body.find((n) => n.type === 'heading');
    expect(h?.type).toBe('heading');
    if (h?.type === 'heading') {
      expect(h.level).toBe(1);
      expect(h.content).toEqual([
        { kind: 'em', children: [{ kind: 'text', text: 'Subsist' }] },
        { kind: 'text', text: ' (Untrained)' },
      ]);
    }
  });

  it('warns and drops body-level headings above h4', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = parse('##### Too deep');
    expect(doc.body).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('h5 is not valid'),
    );
    warn.mockRestore();
  });

  it('groups consecutive list items into one list node', () => {
    const doc = parse('* one\n* two\n* three');
    expect(doc.body).toHaveLength(1);
    expect(doc.body[0]?.type).toBe('list');
    if (doc.body[0]?.type === 'list') {
      expect(doc.body[0].items).toHaveLength(3);
    }
  });

  it('preserves inline emphasis in list items', () => {
    const doc = parse('* **Arcana** Arcane theories');
    if (doc.body[0]?.type === 'list') {
      expect(doc.body[0].items[0]).toEqual([
        { kind: 'strong', children: [{ kind: 'text', text: 'Arcana' }] },
        { kind: 'text', text: ' Arcane theories' },
      ]);
    }
  });
});

describe('parse — paragraphs', () => {
  it('joins consecutive lines into one paragraph with spaces', () => {
    const doc = parse('Line one\nLine two\nLine three');
    expect(doc.body).toHaveLength(1);
    if (doc.body[0]?.type === 'paragraph') {
      expect(doc.body[0].content).toEqual([
        { kind: 'text', text: 'Line one Line two Line three' },
      ]);
    }
  });

  it('splits paragraphs on blank lines', () => {
    const doc = parse('First.\n\nSecond.\n\nThird.');
    expect(doc.body).toHaveLength(3);
    expect(doc.body.every((n) => n.type === 'paragraph')).toBe(true);
  });

  it('warns and drops a body-level centered paragraph (^ is sample-only)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = parse('^ **Damage** equals level × 2');
    expect(doc.body).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'centered text (^) is only valid inside sample()',
      ),
    );
    warn.mockRestore();
  });
});

describe('parse — item block', () => {
  it('parses item with name, action, subtitle, traits', () => {
    const doc = parse(
      'item(\n# Power Strike :a:\n## Feat 4\n-\n; uncommon, class\nBody text.\n)',
    );
    const item = doc.body.find((n) => n.type === 'item');
    expect(item?.type).toBe('item');
    if (item?.type === 'item') {
      expect(item.name).toEqual([{ kind: 'text', text: 'Power Strike' }]);
      expect(item.action).toBe(':a:');
      expect(item.subtitle).toEqual([{ kind: 'text', text: 'Feat 4' }]);
      expect(item.traits).toEqual(['uncommon', 'class']);
    }
  });

  it('parses item without subtitle or traits', () => {
    const doc = parse('item(\n# Cool Feat\n-\nBody\n)');
    const item = doc.body.find((n) => n.type === 'item');
    if (item?.type === 'item') {
      expect(item.subtitle).toBeUndefined();
      expect(item.traits).toEqual([]);
    }
  });

  it('splits content on hr separators', () => {
    const doc = parse('item(\n# Foo\n-\n; t\nFirst\n-\nSecond\n-\nThird\n)');
    const item = doc.body.find((n) => n.type === 'item');
    if (item?.type === 'item') {
      expect(item.content).toMatchObject([
        {
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'First' }],
          indent: 'none',
        },
        { kind: 'hr' },
        {
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'Second' }],
          indent: 'none',
        },
        { kind: 'hr' },
        {
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'Third' }],
          indent: 'none',
        },
      ]);
    }
  });

  it('splits text on blank lines into separate paragraphs', () => {
    const doc = parse(
      'item(\n# Foo\n-\n; t\n**Trigger** You are hit.\n\n**Requirements** A spell.\n)',
    );
    const item = doc.body.find((n) => n.type === 'item');
    if (item?.type === 'item') {
      expect(item.content).toHaveLength(2);
      expect(item.content[0]?.kind).toBe('paragraph');
      expect(item.content[1]?.kind).toBe('paragraph');
    }
  });

  it('joins consecutive lines in same paragraph with a space', () => {
    const doc = parse(
      'item(\n# Foo\n-\n; t\nLine one of paragraph.\nLine two of same paragraph.\n)',
    );
    const item = doc.body.find((n) => n.type === 'item');
    if (item?.type === 'item') {
      expect(item.content).toMatchObject([
        {
          kind: 'paragraph',
          content: [
            {
              kind: 'text',
              text: 'Line one of paragraph. Line two of same paragraph.',
            },
          ],
          indent: 'none',
        },
      ]);
    }
  });

  it('supports column-break inside item content', () => {
    const doc = parse('item(\n# Foo\n-\n; t\nLeft\n|\nRight\n)');
    const item = doc.body.find((n) => n.type === 'item');
    if (item?.type === 'item') {
      // The second paragraph is "2nd+ in its section" — column-break is a
      // layout marker, not a section reset — so it picks up first-line indent.
      expect(item.content).toMatchObject([
        {
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'Left' }],
          indent: 'none',
        },
        { kind: 'column-break' },
        {
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'Right' }],
          indent: 'first-line',
        },
      ]);
    }
  });

  it('warns and drops leading hr after traits', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    parse('item(\n# Foo\n-\n; t\n-\nBody\n)');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('leading hr is invalid'),
    );
    warn.mockRestore();
  });

  it('warns and drops trailing column-break', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    parse('item(\n# Foo\n-\n; t\nBody\n|\n)');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('trailing column-break is invalid'),
    );
    warn.mockRestore();
  });
});

describe('parse — info / rule / sample / head', () => {
  it('info() splits on column-break', () => {
    const doc = parse('info(\nLeft\n|\nRight\n)');
    const info = doc.body.find((n) => n.type === 'info');
    if (info?.type === 'info') {
      expect(info.content).toMatchObject([
        {
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'Left' }],
          indent: 'none',
        },
        { kind: 'column-break' },
        {
          kind: 'paragraph',
          content: [{ kind: 'text', text: 'Right' }],
          indent: 'none',
        },
      ]);
    }
  });

  it('sample() supports centered paragraph', () => {
    const doc = parse(
      'sample(\n# Damage Formula\n\n^ **Damage** equals your level × 2\n\nThis is normal text.\n)',
    );
    const s = doc.body.find((n) => n.type === 'sample');
    if (s?.type === 'sample') {
      expect(s.content.map((seg) => seg.kind)).toEqual([
        'heading',
        'centered-paragraph',
        'paragraph',
      ]);
    }
  });

  it('sample() centered line still parses inline superscript', () => {
    // The line-level `^ ` (caret+space) centered marker and the inline `^...^`
    // superscript coexist: the lexer consumes the leading `^ `, then parseInline
    // turns the remaining `^2^` into a sup. Locks this invariant without a golden.
    const doc = parse('sample(\n^ E = mc^2^\n)');
    const s = doc.body.find((n) => n.type === 'sample');
    expect(s?.type).toBe('sample');
    if (s?.type === 'sample') {
      const seg = s.content[0];
      expect(seg?.kind).toBe('centered-paragraph');
      if (seg?.kind === 'centered-paragraph') {
        expect(seg.content).toEqual([
          { kind: 'text', text: 'E = mc' },
          { kind: 'sup', children: [{ kind: 'text', text: '2' }] },
        ]);
      }
    }
  });

  it('rule() outside full-width strips column-break with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = parse('rule(\nLeft\n|\nRight\n)');
    const r = doc.body.find((n) => n.type === 'rule');
    if (r?.type === 'rule') {
      expect(r.fullWidth).toBe(false);
      expect(r.content.some((s) => s.kind === 'column-break')).toBe(false);
    }
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('only valid inside a full-width rule block'),
    );
    warn.mockRestore();
  });

  it('rule() inside full-width retains column-break and is marked fullWidth', () => {
    const doc = parse('/\n\nrule(\nLeft\n|\nRight\n)\n\n/');
    const r = doc.body.find((n) => n.type === 'rule');
    if (r?.type === 'rule') {
      expect(r.fullWidth).toBe(true);
      expect(r.content.map((s) => s.kind)).toEqual([
        'paragraph',
        'column-break',
        'paragraph',
      ]);
    }
  });

  it('rule() supports a table segment with a lifted caption', () => {
    const doc = parse('rule(\n#### Caption\n\nA | B\n--- | ---\n1 | 2\n)');
    const r = doc.body.find((n) => n.type === 'rule');
    if (r?.type === 'rule') {
      expect(r.content).toHaveLength(1);
      const seg = r.content[0];
      expect(seg.kind).toBe('table');
      if (seg.kind === 'table') {
        expect(seg.node.caption).toEqual([{ kind: 'text', text: 'Caption' }]);
      }
    }
  });

  it('rule() supports a headerless table segment', () => {
    const doc = parse('rule(\n|---|---|\n| a | b |\n| c | d |\n)');
    const r = doc.body.find((n) => n.type === 'rule');
    expect(r?.type).toBe('rule');
    if (r?.type === 'rule') {
      expect(r.content).toHaveLength(1);
      const seg = r.content[0];
      expect(seg.kind).toBe('table');
      if (seg.kind === 'table') {
        expect(seg.node.headers).toEqual([]);
        expect(seg.node.rows).toHaveLength(2);
      }
    }
  });
});

describe('parse — tables', () => {
  it('parses headers, alignments, and rows', () => {
    const doc = parse('A | B | C\n--- | :---: | ---:\n1 | 2 | 3');
    const table = doc.body.find((n) => n.type === 'table');
    if (table?.type === 'table') {
      expect(table.colCount).toBe(3);
      expect(table.alignments).toEqual(['left', 'center', 'right']);
      expect(table.headers).toHaveLength(3);
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0]?.[1]).toEqual([{ kind: 'text', text: '2' }]);
    }
  });

  it('parses inline superscript inside a table cell', () => {
    // The real Monster Core use case: a rarity marker on a creature name in an
    // index table. Proves `^...^` flows through parseCellInline → parseInline.
    const doc = parse('Name | Rarity\n--- | ---\nHerexen^U^ | rare');
    const table = doc.body.find((n) => n.type === 'table');
    expect(table?.type).toBe('table');
    if (table?.type === 'table') {
      expect(table.rows[0]?.[0]).toEqual([
        { kind: 'text', text: 'Herexen' },
        { kind: 'sup', children: [{ kind: 'text', text: 'U' }] },
      ]);
    }
  });

  it('captures unnumbered footnotes', () => {
    const doc = parse('A | B\n--- | ---\n1[*] | 2\n. [*] note text');
    const table = doc.body.find((n) => n.type === 'table');
    if (table?.type === 'table') {
      expect(table.footnotes).toHaveLength(1);
      expect(table.footnotes[0]).toEqual({
        type: 'unnumbered',
        children: [{ kind: 'text', text: 'note text' }],
      });
    }
  });

  it('captures numbered footnotes with their markers', () => {
    const doc = parse(
      'A[1] | B[2]\n--- | ---\n1 | 2\n. [1] first\n. [2] second',
    );
    const table = doc.body.find((n) => n.type === 'table');
    if (table?.type === 'table') {
      expect(table.footnotes).toEqual([
        {
          type: 'numbered',
          value: '1',
          children: [{ kind: 'text', text: 'first' }],
        },
        {
          type: 'numbered',
          value: '2',
          children: [{ kind: 'text', text: 'second' }],
        },
      ]);
    }
  });

  it('wraps cell text in a single trailing FootnoteRef', () => {
    const doc = parse('A | B[1]\n--- | ---\n1 | 2[1]\n. [1] note');
    const table = doc.body.find((n) => n.type === 'table');
    if (table?.type === 'table') {
      expect(table.headers[1]).toEqual([
        {
          kind: 'footnote-ref',
          type: 'numbered',
          value: '1',
          children: [{ kind: 'text', text: 'B' }],
        },
      ]);
      expect(table.rows[0]?.[1]).toEqual([
        {
          kind: 'footnote-ref',
          type: 'numbered',
          value: '1',
          children: [{ kind: 'text', text: '2' }],
        },
      ]);
    }
  });

  it('lifts a preceding heading4+ as caption', () => {
    const doc = parse('#### Caption\n\nA | B\n--- | ---\n1 | 2');
    const table = doc.body.find((n) => n.type === 'table');
    if (table?.type === 'table') {
      expect(table.caption).toEqual([{ kind: 'text', text: 'Caption' }]);
    }
    // The heading should not appear separately
    expect(doc.body.filter((n) => n.type === 'heading')).toHaveLength(0);
  });

  describe('headerless (leading separator)', () => {
    it('parses a table with no header row', () => {
      const doc = parse('|:---|---:|\n| a | b |\n| c | d |');
      const table = doc.body.find((n) => n.type === 'table');
      expect(table?.type).toBe('table');
      if (table?.type === 'table') {
        expect(table.colCount).toBe(2);
        expect(table.headers).toEqual([]);
        expect(table.alignments).toEqual(['left', 'right']);
        expect(table.rows).toHaveLength(2);
        expect(table.rows[0]?.[0]).toEqual([{ kind: 'text', text: 'a' }]);
        expect(table.rows[1]?.[1]).toEqual([{ kind: 'text', text: 'd' }]);
      }
    });

    it('captures footnotes in a headerless table', () => {
      const doc = parse('|---|---|\n| a | b[*] |\n. [*] note');
      const table = doc.body.find((n) => n.type === 'table');
      expect(table?.type).toBe('table');
      if (table?.type === 'table') {
        expect(table.headers).toEqual([]);
        expect(table.footnotes).toEqual([
          { type: 'unnumbered', children: [{ kind: 'text', text: 'note' }] },
        ]);
      }
    });

    it('lifts a preceding heading4+ as caption for a headerless table', () => {
      const doc = parse('#### Caption\n\n|---|---|\n| a | b |');
      const table = doc.body.find((n) => n.type === 'table');
      expect(table?.type).toBe('table');
      if (table?.type === 'table') {
        expect(table.headers).toEqual([]);
        expect(table.caption).toEqual([{ kind: 'text', text: 'Caption' }]);
      }
      expect(doc.body.filter((n) => n.type === 'heading')).toHaveLength(0);
    });
  });

  describe('column-count validation', () => {
    it('warns on a row narrower than the header', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      parse('A | B | C\n--- | --- | ---\n1 | 2');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('has 2 cells but the table has 3 columns'),
      );
      warn.mockRestore();
    });

    it('warns on a row wider than the header', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      parse('A | B\n--- | ---\n1 | 2 | 3');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('has 3 cells but the table has 2 columns'),
      );
      warn.mockRestore();
    });

    it('validates headerless rows against the separator width', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      parse('|---|---|\n| a | b | c |');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('has 3 cells but the table has 2 columns'),
      );
      warn.mockRestore();
    });

    it('does not warn when every row matches the column count', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      parse('A | B\n--- | ---\n1 | 2\n3 | 4');
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

describe('parse — action glyph variants (book p102 area)', () => {
  for (const glyph of [':a:', ':aa:', ':aaa:', ':r:', ':f:']) {
    it(`parses ${glyph}`, () => {
      const doc = parse(`item(\n# Foo ${glyph}\n-\nBody\n)`);
      const item = doc.body.find((n) => n.type === 'item');
      if (item?.type === 'item') {
        expect(item.action).toBe(glyph);
        expect(item.name).toEqual([{ kind: 'text', text: 'Foo' }]);
      }
    });
  }
});

describe('parse — paragraph indent rules', () => {
  it('body: first paragraph is none, second gets first-line indent', () => {
    const doc = parse('First.\n\nSecond.');
    const paras = doc.body.filter((n) => n.type === 'paragraph');
    if (paras[0]?.type === 'paragraph') expect(paras[0].indent).toBe('none');
    if (paras[1]?.type === 'paragraph')
      expect(paras[1].indent).toBe('first-line');
  });

  it('body: a heading resets the section, so the next paragraph is none', () => {
    const doc = parse('First.\n\n# Title\n\nAfter heading.');
    const paras = doc.body.filter((n) => n.type === 'paragraph');
    if (paras[1]?.type === 'paragraph') expect(paras[1].indent).toBe('none');
  });

  it('body: bold-leading paragraph behaves like any 2nd+ paragraph (first-line)', () => {
    const doc = parse('First.\n\n**Bold** lead.');
    const second = doc.body[2];
    if (second?.type === 'paragraph') expect(second.indent).toBe('first-line');
  });

  it('item: bold-leading paragraphs get hanging indent', () => {
    const doc = parse(
      'item(\n# Foo\n-\n;t\nFirst para.\n\n**Crit** does X.\n)',
    );
    const item = doc.body.find((n) => n.type === 'item');
    if (item?.type === 'item') {
      const p2 = item.content[1];
      if (p2 && p2.kind === 'paragraph') expect(p2.indent).toBe('hanging');
    }
  });

  it('item: hr resets first-paragraph state', () => {
    const doc = parse('item(\n# Foo\n-\n;t\nA.\n\nB.\n\n-\n\nC.\n)');
    const item = doc.body.find((n) => n.type === 'item');
    if (item?.type === 'item') {
      const paras = item.content.filter((s) => s.kind === 'paragraph');
      // A: first → none; B: 2nd+ → first-line; C: post-hr first → none.
      if (paras[0]?.kind === 'paragraph') expect(paras[0].indent).toBe('none');
      if (paras[1]?.kind === 'paragraph')
        expect(paras[1].indent).toBe('first-line');
      if (paras[2]?.kind === 'paragraph') expect(paras[2].indent).toBe('none');
    }
  });

  it('rule: bold-leading paragraphs get first-line (not hanging) indent', () => {
    const doc = parse('rule(\nFirst.\n\n**Bold** lead.\n)');
    const r = doc.body.find((n) => n.type === 'rule');
    if (r?.type === 'rule') {
      const p2 = r.content[1];
      if (p2 && p2.kind === 'paragraph') expect(p2.indent).toBe('first-line');
    }
  });

  it('sample: every paragraph indent is none', () => {
    const doc = parse('sample(\nA.\n\nB.\n\n**Bold.**\n)');
    const s = doc.body.find((n) => n.type === 'sample');
    if (s?.type === 'sample') {
      for (const seg of s.content)
        if (seg.kind === 'paragraph') expect(seg.indent).toBe('none');
    }
  });

  it('lists: block-indented in body, flush in rule', () => {
    const docBody = parse('* a\n* b');
    const list = docBody.body.find((n) => n.type === 'list');
    if (list?.type === 'list') expect(list.indent).toBe('block');

    const docRule = parse('rule(\n* a\n* b\n)');
    const r = docRule.body.find((n) => n.type === 'rule');
    if (r?.type === 'rule') {
      const inner = r.content[0];
      if (inner && inner.kind === 'list') expect(inner.indent).toBe('none');
    }
  });
});

// Matrix-driven negative cases for the per-container allow-list. For every
// (container, kind) pair where `kind` is *not* in `ALLOWED_SEGMENTS[container]`
// the parser should warn and drop the segment. Driving this off the same
// table the parser uses keeps tests in lock-step with the implementation —
// adding a kind or tightening a container is a single-line change.
describe('parse — segment allow-list (warn-and-drop matrix)', () => {
  // Minimal source snippet that produces each segment kind. Used as the
  // payload inside each container during testing.
  const KIND_INPUT: Record<string, string> = {
    paragraph: 'A paragraph.',
    heading: '# A heading',
    list: '* one\n* two',
    'column-break': '|',
    hr: '-',
    'centered-paragraph': '^ centered text',
    table: 'A | B\n--- | ---\n1 | 2',
  };

  // How to wrap a snippet in each container's block syntax. `item` requires
  // a leading heading + hr before its content.
  type Container = keyof typeof ALLOWED_SEGMENTS;
  const wrap: Record<Container, (inner: string) => string> = {
    item: (i) => `item(\n# Foo\n-\n${i}\n)`,
    sample: (i) => `sample(\n${i}\n)`,
    rule: (i) => `rule(\n${i}\n)`,
    info: (i) => `info(\n${i}\n)`,
    head: (i) => `head(\n${i}\n)`,
  };

  // Container keyword → matching `BodyNode.type`.
  const blockType: Record<Container, string> = {
    item: 'item',
    sample: 'sample',
    rule: 'rule',
    info: 'info',
    head: 'head',
  };

  for (const [container, allowed] of Object.entries(ALLOWED_SEGMENTS) as [
    Container,
    Set<string>,
  ][]) {
    for (const kind of Object.keys(KIND_INPUT)) {
      if (allowed.has(kind)) continue;

      it(`${container}() warns and drops ${kind}`, () => {
        const warn = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => undefined);

        const doc = parse(wrap[container](KIND_INPUT[kind]));
        const block = doc.body.find((n) => n.type === blockType[container]);

        // Block must exist; its content must contain no segment of `kind`.
        expect(block).toBeDefined();
        if (block && 'content' in block && Array.isArray(block.content)) {
          expect(
            (block.content as { kind: string }[]).some((s) => s.kind === kind),
          ).toBe(false);
        }
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`${kind} is not valid inside ${container}()`),
        );

        warn.mockRestore();
      });
    }
  }
});

// Matrix-driven cases for the per-container heading-level cap. For every
// (container, level) pair where `level` exceeds `MAX_HEADING_LEVEL[container]`
// the parser should warn and drop the heading; for levels at or below the cap
// the heading is retained. Containers without an entry in MAX_HEADING_LEVEL
// (item, sample, rule) are unconstrained and aren't exercised here — they're
// covered indirectly by the allow-list matrix above.
describe('parse — heading-level cap (warn-and-drop matrix)', () => {
  type Container = keyof typeof ALLOWED_SEGMENTS;
  const wrap: Record<Container, (inner: string) => string> = {
    item: (i) => `item(\n# Foo\n-\n${i}\n)`,
    sample: (i) => `sample(\n${i}\n)`,
    rule: (i) => `rule(\n${i}\n)`,
    info: (i) => `info(\n${i}\n)`,
    head: (i) => `head(\n${i}\n)`,
  };
  const blockType: Record<Container, string> = {
    item: 'item',
    sample: 'sample',
    rule: 'rule',
    info: 'info',
    head: 'head',
  };
  const LEVELS = [1, 2, 3, 4, 5, 6] as const;

  for (const [container, maxLevel] of Object.entries(MAX_HEADING_LEVEL) as [
    Container,
    number,
  ][]) {
    for (const level of LEVELS) {
      const hashes = '#'.repeat(level);
      const shouldDrop = level > maxLevel;

      it(`${container}() ${
        shouldDrop ? 'warns and drops' : 'retains'
      } h${level}`, () => {
        const warn = vi
          .spyOn(console, 'warn')
          .mockImplementation(() => undefined);

        const doc = parse(wrap[container](`${hashes} Title`));
        const block = doc.body.find((n) => n.type === blockType[container]);
        expect(block).toBeDefined();

        const headings =
          block && 'content' in block && Array.isArray(block.content)
            ? (block.content as { kind: string; level?: number }[]).filter(
                (s) => s.kind === 'heading',
              )
            : [];

        if (shouldDrop) {
          expect(headings).toHaveLength(0);
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining(
              `h${level} is not valid inside ${container}()`,
            ),
          );
        } else {
          expect(headings).toHaveLength(1);
          expect(headings[0]?.level).toBe(level);
          // No level-cap warning should fire for an in-range heading. Other
          // warnings could legitimately fire (unrelated to the cap), so we
          // assert only that no `h{N} is not valid` message was emitted.
          for (const call of warn.mock.calls) {
            expect(String(call[0])).not.toMatch(/h\d is not valid inside/);
          }
        }

        warn.mockRestore();
      });
    }
  }
});

// Assert a value is defined and return it — keeps the provenance tests free of
// `!` (the codebase lints with --max-warnings 0).
function present<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}

describe('parse — provenance (origins)', () => {
  it('gives every body node an origin that resolves in tokenMap', () => {
    const doc = parse('# Title\n\nA paragraph.\n\nitem(\n# Foo\n-\nBody\n)');
    expect(doc.body.length).toBeGreaterThan(0);
    for (const node of doc.body) {
      expect(doc.tokenMap.get(node.origin.first)).toBeDefined();
      expect(doc.tokenMap.get(node.origin.last)).toBeDefined();
    }
  });

  it('resolves node origins to their source start line', () => {
    const doc = parse('# Title\n\nA paragraph.\n\nitem(\n# Foo\n-\nBody\n)');
    const heading = present(doc.body.find((n) => n.type === 'heading'));
    const para = present(doc.body.find((n) => n.type === 'paragraph'));
    const item = present(doc.body.find((n) => n.type === 'item'));
    expect(present(doc.tokenMap.get(heading.origin.first)).startLine).toBe(1);
    expect(present(doc.tokenMap.get(para.origin.first)).startLine).toBe(3);
    expect(present(doc.tokenMap.get(item.origin.first)).startLine).toBe(5);
  });

  it('origin.last gives the end line of a multi-line paragraph', () => {
    const doc = parse('Line one\nLine two\nLine three');
    const para = present(doc.body.find((n) => n.type === 'paragraph'));
    expect(present(doc.tokenMap.get(para.origin.first)).startLine).toBe(1);
    expect(present(doc.tokenMap.get(para.origin.last)).endLine).toBe(3);
  });

  it('a table origin spans through its last footnote', () => {
    const doc = parse('A | B\n--- | ---\n1[*] | 2\n. [*] note');
    const table = present(doc.body.find((n) => n.type === 'table'));
    expect(present(doc.tokenMap.get(table.origin.first)).startLine).toBe(1);
    expect(present(doc.tokenMap.get(table.origin.last)).startLine).toBe(4);
  });

  it('anchors an expanded ref at the call site; the template keeps the definition line', () => {
    const doc = parse('ref {\nHello\n}\n\nIntro.\n\n{{ref}}');
    const template = present(present(doc.contentRefs.get('ref'))[0]);
    expect(present(doc.tokenMap.get(template.origin.first)).startLine).toBe(2);
    const paras = doc.body.filter((n) => n.type === 'paragraph');
    const expanded = present(paras[paras.length - 1]);
    expect(present(doc.tokenMap.get(expanded.origin.first)).startLine).toBe(7);
  });

  it('resolves a hidden-section ref template origin against tokenMap', () => {
    // The definition lives past `%`, so its tokens are outside the visible
    // slice — proving tokenMap covers the whole tree, not just the body.
    const doc = parse('Visible\n\n%\n\nsecret {\nHidden line\n}');
    const template = present(present(doc.contentRefs.get('secret'))[0]);
    expect(present(doc.tokenMap.get(template.origin.first)).startLine).toBe(6);
  });

  it('anchors an unknown {{ref}} literal paragraph at its own line', () => {
    const doc = parse('Intro.\n\n{{missing}}');
    const paras = doc.body.filter((n) => n.type === 'paragraph');
    const para = present(paras[paras.length - 1]);
    expect(present(doc.tokenMap.get(para.origin.first)).startLine).toBe(3);
  });

  it('anchors a table nested in rule() at its header line (ref-safe)', () => {
    const doc = parse('rule(\n#### Cap\n\nA | B\n--- | ---\n1 | 2\n)');
    const rule = present(doc.body.find((n) => n.type === 'rule'));
    if (rule.type !== 'rule') throw new Error('expected rule');
    const seg = rule.content.find((s) => s.kind === 'table');
    expect(seg?.kind).toBe('table');
    if (seg?.kind === 'table') {
      // The `A | B` header row sits on line 4 inside the block; the origin
      // must point there, not at the lifted `#### Cap` caption or the block.
      expect(present(doc.tokenMap.get(seg.node.origin.first)).startLine).toBe(
        4,
      );
    }
  });
});

// Parse with the console warnings muted. Diagnostics assertions read the
// structured `doc.diagnostics` instead, so the printed copy is just noise here.
function parseQuiet(src: string): GlyphDocument {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    return parse(src);
  } finally {
    warn.mockRestore();
  }
}

function startLine(doc: GlyphDocument, origin: Origin): number {
  return present(doc.tokenMap.get(origin.first)).startLine;
}

function endLine(doc: GlyphDocument, origin: Origin): number {
  return present(doc.tokenMap.get(origin.last)).endLine;
}

function diag(doc: GlyphDocument, code: DiagnosticCode) {
  return present(doc.diagnostics.find((d) => d.code === code));
}

// Every container block's segment list, flattened — used to assert that
// provenance is total below the body level, not just on `BodyNode`s.
function allSegments(doc: GlyphDocument) {
  return doc.body.flatMap((node) =>
    node.type === 'item' ||
    node.type === 'info' ||
    node.type === 'rule' ||
    node.type === 'sample' ||
    node.type === 'head'
      ? [...node.content]
      : [],
  );
}

describe('parse — provenance (segment origins)', () => {
  it('gives every segment of every container an origin that resolves in tokenMap', () => {
    const doc = parseQuiet(
      [
        'item(',
        '# Foo',
        '-',
        '; t',
        'Body',
        '* a',
        ')',
        '',
        'info(',
        'Left',
        '|',
        'Right',
        ')',
        '',
        'sample(',
        '# S',
        '^ centered',
        ')',
        '',
        'head(',
        '# H',
        'Sub',
        ')',
        '',
        'rule(',
        '# R',
        'A | B',
        '--- | ---',
        '1 | 2',
        ')',
      ].join('\n'),
    );
    const segments = allSegments(doc);
    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expect(doc.tokenMap.get(seg.origin.first)).toBeDefined();
      expect(doc.tokenMap.get(seg.origin.last)).toBeDefined();
    }
  });

  it('anchors item segments at their own lines, not at the item() line', () => {
    //           1       2      3    4     5        6       7    8      9    10
    const doc = parse(
      'item(\n# Foo\n-\n; t\nFirst\nsecond line\n-\n* a\n* b\n)',
    );
    const item = present(doc.body.find((n) => n.type === 'item'));
    if (item.type !== 'item') throw new Error('expected item');
    const [para, hr, list] = item.content;
    // The item itself still anchors at `item(` — segments go finer.
    expect(startLine(doc, item.origin)).toBe(1);
    expect(startLine(doc, present(para).origin)).toBe(5);
    // A paragraph joins its physical lines, so origin.last reaches line 6.
    expect(endLine(doc, present(para).origin)).toBe(6);
    expect(startLine(doc, present(hr).origin)).toBe(7);
    expect(startLine(doc, present(list).origin)).toBe(8);
    expect(endLine(doc, present(list).origin)).toBe(9);
  });

  it('anchors a sample() centered paragraph at its ^ line', () => {
    const doc = parse('sample(\n# H\n\n^ centered\n\nText.\n)');
    const sample = present(doc.body.find((n) => n.type === 'sample'));
    if (sample.type !== 'sample') throw new Error('expected sample');
    const centered = present(
      sample.content.find((s) => s.kind === 'centered-paragraph'),
    );
    expect(startLine(doc, centered.origin)).toBe(4);
    const heading = present(sample.content.find((s) => s.kind === 'heading'));
    expect(startLine(doc, heading.origin)).toBe(2);
  });

  it('anchors an info() column-break at its | line', () => {
    const doc = parse('info(\nLeft\n|\nRight\n)');
    const info = present(doc.body.find((n) => n.type === 'info'));
    if (info.type !== 'info') throw new Error('expected info');
    expect(info.content.map((s) => startLine(doc, s.origin))).toEqual([
      2, 3, 4,
    ]);
  });

  it('mirrors a table segment origin onto its wrapper', () => {
    const doc = parse('rule(\n#### Cap\n\nA | B\n--- | ---\n1 | 2\n)');
    const rule = present(doc.body.find((n) => n.type === 'rule'));
    if (rule.type !== 'rule') throw new Error('expected rule');
    const seg = present(rule.content.find((s) => s.kind === 'table'));
    if (seg.kind !== 'table') throw new Error('expected table segment');
    expect(seg.origin).toEqual(seg.node.origin);
    expect(startLine(doc, seg.origin)).toBe(4);
  });

  it('retargets segment origins of an expanded ref to the call site', () => {
    //           1      2      3     4      5  6  7  8       9  10
    const doc = parse('ref {\nrule(\n# T\nBody\n)\n}\n\nIntro.\n\n{{ref}}');
    const template = present(present(doc.contentRefs.get('ref'))[0]);
    if (template.type !== 'rule') throw new Error('expected rule template');
    // Definition-site: the block on line 2, its segments on lines 3 and 4.
    expect(startLine(doc, template.origin)).toBe(2);
    expect(template.content.map((s) => startLine(doc, s.origin))).toEqual([
      3, 4,
    ]);

    const expanded = present(doc.body.find((n) => n.type === 'rule'));
    if (expanded.type !== 'rule') throw new Error('expected expanded rule');
    // Call-site: the block *and every segment inside it* collapse onto the
    // `{{ref}}` line, which is where the content reads in the document.
    expect(startLine(doc, expanded.origin)).toBe(10);
    expect(expanded.content.map((s) => startLine(doc, s.origin))).toEqual([
      10, 10,
    ]);
  });

  it('retargets segment origins of an expanded item ref too', () => {
    //           1      2      3     4   5     6   7  8  9
    const doc = parse('ref {\nitem(\n# Foo\n-\nBody\n)\n}\n\n{{ref}}');
    const expanded = present(doc.body.find((n) => n.type === 'item'));
    if (expanded.type !== 'item') throw new Error('expected item');
    expect(startLine(doc, expanded.origin)).toBe(9);
    for (const seg of expanded.content) {
      expect(startLine(doc, seg.origin)).toBe(9);
    }
  });

  it('retargets a table nested in an expanded rule ref, node and wrapper', () => {
    // The deepest origin-bearer in the IR: a TableNode below a rule() segment.
    // Exercises the one recursive branch of the retarget walk.
    //                1      2      3      4          5      6  7  8  9
    const doc = parse('ref {\nrule(\nA | B\n--- | ---\n1 | 2\n)\n}\n\n{{ref}}');

    const template = present(present(doc.contentRefs.get('ref'))[0]);
    if (template.type !== 'rule') throw new Error('expected rule template');
    const tplSeg = present(template.content.find((s) => s.kind === 'table'));
    if (tplSeg.kind !== 'table') throw new Error('expected table segment');
    // Definition-site: the header row on line 3.
    expect(startLine(doc, tplSeg.origin)).toBe(3);
    expect(startLine(doc, tplSeg.node.origin)).toBe(3);

    const expanded = present(doc.body.find((n) => n.type === 'rule'));
    if (expanded.type !== 'rule') throw new Error('expected rule');
    const seg = present(expanded.content.find((s) => s.kind === 'table'));
    if (seg.kind !== 'table') throw new Error('expected table segment');
    expect(startLine(doc, expanded.origin)).toBe(9);
    expect(startLine(doc, seg.origin)).toBe(9);
    // The nested node must move too — not just the segment wrapper.
    expect(startLine(doc, seg.node.origin)).toBe(9);
    expect(endLine(doc, seg.node.origin)).toBe(9);
  });
});

describe('parse — diagnostics', () => {
  it('reports none for a clean document', () => {
    const doc = parse('# Title\n\nText.\n\nitem(\n# Foo\n-\nBody\n)');
    expect(doc.diagnostics).toEqual([]);
  });

  it('anchors every diagnostic to a span that resolves in tokenMap', () => {
    const doc = parseQuiet('##### Deep\n\n-\n\n;a,b\n\n^ centered');
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    for (const d of doc.diagnostics) {
      expect(doc.tokenMap.get(d.origin.first)).toBeDefined();
      expect(doc.tokenMap.get(d.origin.last)).toBeDefined();
    }
  });

  it('reports body-level strays with their code and line', () => {
    const doc = parseQuiet('Intro.\n\n-\n\n;a,b\n\n^ centered\n\n##### Deep');
    expect(doc.diagnostics.map((d) => d.code)).toEqual([
      'top-level-hr',
      'trait-line-outside-item',
      'centered-text-outside-sample',
      'heading-level-unsupported',
    ]);
    expect(startLine(doc, diag(doc, 'top-level-hr').origin)).toBe(3);
    expect(startLine(doc, diag(doc, 'trait-line-outside-item').origin)).toBe(5);
    expect(
      startLine(doc, diag(doc, 'centered-text-outside-sample').origin),
    ).toBe(7);
    expect(startLine(doc, diag(doc, 'heading-level-unsupported').origin)).toBe(
      9,
    );
  });

  it('anchors a disallowed segment at the segment, not the block', () => {
    //                 1      2      3   4     5     6        7
    const doc = parseQuiet('item(\n# Foo\n-\n; t\nBody\n## Nope\n)');
    const d = diag(doc, 'invalid-segment-in-container');
    expect(d.message).toContain('heading is not valid inside item()');
    expect(startLine(doc, d.origin)).toBe(6);
  });

  it('anchors a container heading-level violation at the heading', () => {
    const doc = parseQuiet('head(\n# H\n### Deep\n)');
    const d = diag(doc, 'heading-level-unsupported');
    expect(d.message).toContain('only h1..h2');
    expect(startLine(doc, d.origin)).toBe(3);
  });

  it('anchors a missing item hr at the item() line', () => {
    const doc = parseQuiet('Intro.\n\nitem(\n# Foo\nBody\n)');
    expect(startLine(doc, diag(doc, 'item-missing-hr').origin)).toBe(3);
  });

  it('anchors a nested content-ref definition at its own line', () => {
    const doc = parseQuiet('rule(\nmyref {\nInside\n}\n)');
    const d = diag(doc, 'content-ref-nested');
    expect(startLine(doc, d.origin)).toBe(2);
  });

  it('anchors leading and trailing dividers at the divider line', () => {
    const leading = parseQuiet('item(\n# Foo\n-\n; t\n-\nBody\n)');
    expect(startLine(leading, diag(leading, 'leading-divider').origin)).toBe(5);
    const trailing = parseQuiet('item(\n# Foo\n-\n; t\nBody\n|\n)');
    expect(startLine(trailing, diag(trailing, 'trailing-divider').origin)).toBe(
      6,
    );
  });

  it('anchors a stripped rule() column-break at its | line', () => {
    const doc = parseQuiet('rule(\nA\n|\nB\n)');
    const d = diag(doc, 'column-break-outside-full-width');
    expect(startLine(doc, d.origin)).toBe(3);
  });

  it('anchors a ragged table row at that row', () => {
    const doc = parseQuiet('A | B\n--- | ---\n1 | 2\n3 | 4 | 5');
    const d = diag(doc, 'table-ragged-row');
    expect(startLine(doc, d.origin)).toBe(4);
  });

  it('anchors an undefined footnote ref at the whole table', () => {
    // Any cell could hold the ref, so the table is the honest granularity.
    const doc = parseQuiet('A | B\n--- | ---\n1[*] | 2');
    const d = diag(doc, 'table-footnote-undefined');
    expect(startLine(doc, d.origin)).toBe(1);
    expect(endLine(doc, d.origin)).toBe(3);
  });

  it('anchors an unreferenced footnote at its own definition line', () => {
    const doc = parseQuiet('A | B\n--- | ---\n1 | 2\n. [*] note');
    expect(
      startLine(doc, diag(doc, 'table-footnote-unreferenced').origin),
    ).toBe(4);
  });

  it('reports a marker defined twice but never referenced only once', () => {
    // Dedup is by marker, so the duplicate does not double-warn; the retained
    // origin is the first definition.
    const doc = parseQuiet('A | B\n--- | ---\n1 | 2\n. [*] one\n. [*] two');
    const unreferenced = doc.diagnostics.filter(
      (d) => d.code === 'table-footnote-unreferenced',
    );
    expect(unreferenced).toHaveLength(1);
    expect(startLine(doc, present(unreferenced[0]).origin)).toBe(4);
  });

  it('anchors cell-level footnote problems at the offending row', () => {
    const many = parseQuiet(
      'A | B\n--- | ---\n1 | 2\nx[*][2] | y\n. [*] n\n. [2] m',
    );
    expect(
      startLine(many, diag(many, 'table-cell-multiple-footnote-refs').origin),
    ).toBe(4);

    const trailingText = parseQuiet('A | B\n--- | ---\n1[*] tail | 2\n. [*] n');
    expect(
      startLine(
        trailingText,
        diag(trailingText, 'table-cell-footnote-ref-not-trailing').origin,
      ),
    ).toBe(3);
  });

  it('records a ref definition diagnostic once, at the definition', () => {
    // The definition is parsed once at collection time; the two expansions
    // clone already-validated nodes and must not re-report.
    const doc = parseQuiet('bad {\n;trait\n}\n\n{{bad}}\n\n{{bad}}');
    const traitDiags = doc.diagnostics.filter(
      (d) => d.code === 'trait-line-outside-item',
    );
    expect(traitDiags).toHaveLength(1);
    expect(startLine(doc, present(traitDiags[0]).origin)).toBe(2);
  });

  it('prints the same message it records', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const doc = parse('-\n\n;a,b');
    expect(doc.diagnostics.map((d) => d.message)).toEqual(
      warn.mock.calls.map(([m]) => m),
    );
    warn.mockRestore();
  });
});

describe('parseInline', () => {
  it('returns empty for empty input', () => {
    expect(parseInline('')).toEqual([]);
  });

  it('returns plain text', () => {
    expect(parseInline('hello world')).toEqual([
      { kind: 'text', text: 'hello world' },
    ]);
  });

  it('parses bold with **', () => {
    expect(parseInline('**bold**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold' }] },
    ]);
  });

  it('parses bold with __', () => {
    expect(parseInline('__bold__')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold' }] },
    ]);
  });

  it('parses em with *', () => {
    expect(parseInline('*italic*')).toEqual([
      { kind: 'em', children: [{ kind: 'text', text: 'italic' }] },
    ]);
  });

  it('parses em with _', () => {
    expect(parseInline('_italic_')).toEqual([
      { kind: 'em', children: [{ kind: 'text', text: 'italic' }] },
    ]);
  });

  it('mixes bold and plain text', () => {
    expect(parseInline('**Trigger** You are hit.')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Trigger' }] },
      { kind: 'text', text: ' You are hit.' },
    ]);
  });

  it('mixes em and plain text around the bold', () => {
    expect(parseInline('cast *avatar* spell')).toEqual([
      { kind: 'text', text: 'cast ' },
      { kind: 'em', children: [{ kind: 'text', text: 'avatar' }] },
      { kind: 'text', text: ' spell' },
    ]);
  });

  it('handles bold then em', () => {
    expect(parseInline('**Strong** and *italic* mixed')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Strong' }] },
      { kind: 'text', text: ' and ' },
      { kind: 'em', children: [{ kind: 'text', text: 'italic' }] },
      { kind: 'text', text: ' mixed' },
    ]);
  });

  it('treats unbalanced ** as literal text', () => {
    expect(parseInline('**unclosed')).toEqual([
      { kind: 'text', text: '**unclosed' },
    ]);
  });

  it('treats unbalanced * as literal text', () => {
    expect(parseInline('*unclosed')).toEqual([
      { kind: 'text', text: '*unclosed' },
    ]);
  });

  it('treats lone ** as literal', () => {
    expect(parseInline('**')).toEqual([{ kind: 'text', text: '**' }]);
  });

  it('treats empty ** ** as literal (no zero-width strong)', () => {
    expect(parseInline('****')).toEqual([{ kind: 'text', text: '****' }]);
  });

  it('prefers strong over em when ** appears', () => {
    expect(parseInline('**foo**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'foo' }] },
    ]);
  });

  it('does not nest — inner content stays flat text', () => {
    // Arbitrary nesting is unsupported: strong contains literal *inner*, not an
    // em. Combined bold+italic uses the triple form (`***...***`) instead.
    expect(parseInline('**outer *inner* outer**')).toEqual([
      {
        kind: 'strong',
        children: [{ kind: 'text', text: 'outer *inner* outer' }],
      },
    ]);
  });

  it('parses bold+italic with ***', () => {
    expect(parseInline('***bold and italics***')).toEqual([
      {
        kind: 'strong',
        children: [
          {
            kind: 'em',
            children: [{ kind: 'text', text: 'bold and italics' }],
          },
        ],
      },
    ]);
  });

  it('parses bold+italic with ___', () => {
    expect(parseInline('___bold and italics___')).toEqual([
      {
        kind: 'strong',
        children: [
          {
            kind: 'em',
            children: [{ kind: 'text', text: 'bold and italics' }],
          },
        ],
      },
    ]);
  });

  it('binds *** as combined emphasis, not strong-then-em', () => {
    expect(parseInline('***bi*** rest')).toEqual([
      {
        kind: 'strong',
        children: [{ kind: 'em', children: [{ kind: 'text', text: 'bi' }] }],
      },
      { kind: 'text', text: ' rest' },
    ]);
  });

  it('splits a 5-star run so bold can wrap an inner bold+italic span', () => {
    // The valid way to say "bold, then bold+italic, then bold": the `*****`
    // runs split greedily as `**`(close) + `***`(open) and `***`(close) +
    // `**`(open), yielding three adjacent spans.
    expect(parseInline('**bold *****and italics***** and bold**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold ' }] },
      {
        kind: 'strong',
        children: [
          { kind: 'em', children: [{ kind: 'text', text: 'and italics' }] },
        ],
      },
      { kind: 'strong', children: [{ kind: 'text', text: ' and bold' }] },
    ]);
  });

  it('treats a lone 3-star run as literal', () => {
    expect(parseInline('***')).toEqual([{ kind: 'text', text: '***' }]);
  });

  it('treats empty ****** as literal (no zero-width bold+italic)', () => {
    expect(parseInline('******')).toEqual([{ kind: 'text', text: '******' }]);
  });

  it('handles consecutive bold and em without space', () => {
    expect(parseInline('**a***b*')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'a' }] },
      { kind: 'em', children: [{ kind: 'text', text: 'b' }] },
    ]);
  });

  it('preserves non-ascii text', () => {
    expect(parseInline('**Damage** equals level × 2')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Damage' }] },
      { kind: 'text', text: ' equals level × 2' },
    ]);
  });

  it('parses each action symbol as a standalone token', () => {
    for (const sym of [':a:', ':aa:', ':aaa:', ':r:', ':f:'] as const) {
      expect(parseInline(sym)).toEqual([{ kind: 'action', symbol: sym }]);
    }
  });

  it('parses an action symbol inline in body text', () => {
    expect(parseInline('use this symbol: :a:.')).toEqual([
      { kind: 'text', text: 'use this symbol: ' },
      { kind: 'action', symbol: ':a:' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('prefers the longest action token at a position', () => {
    expect(parseInline(':aaa:')).toEqual([{ kind: 'action', symbol: ':aaa:' }]);
    expect(parseInline(':aa:')).toEqual([{ kind: 'action', symbol: ':aa:' }]);
  });

  it('treats unrecognised :x: as literal text', () => {
    expect(parseInline(':b:')).toEqual([{ kind: 'text', text: ':b:' }]);
  });

  it('keeps stray colons as literal text', () => {
    expect(parseInline('ratio 3:1 here')).toEqual([
      { kind: 'text', text: 'ratio 3:1 here' },
    ]);
  });

  it('mixes action symbols with bold and em', () => {
    expect(parseInline('**Cast** *fireball* :aa: at target')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'Cast' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'fireball' }] },
      { kind: 'text', text: ' ' },
      { kind: 'action', symbol: ':aa:' },
      { kind: 'text', text: ' at target' },
    ]);
  });

  it('does not support escape syntax — backslash is literal', () => {
    // TODO Add escape support. For now, `\*` does NOT suppress emphasis;
    // the backslash is a regular character and the `*` is still a delimiter.
    expect(parseInline('\\*not bold\\*')).toEqual([
      { kind: 'text', text: '\\' },
      { kind: 'em', children: [{ kind: 'text', text: 'not bold\\' }] },
    ]);
  });

  it('parses superscript with ^', () => {
    expect(parseInline('Herexen^U^')).toEqual([
      { kind: 'text', text: 'Herexen' },
      { kind: 'sup', children: [{ kind: 'text', text: 'U' }] },
    ]);
  });

  it('parses multi-character superscript content', () => {
    expect(parseInline('Treerazer^Uq^')).toEqual([
      { kind: 'text', text: 'Treerazer' },
      { kind: 'sup', children: [{ kind: 'text', text: 'Uq' }] },
    ]);
  });

  it('parses subscript with ~', () => {
    expect(parseInline('~2~')).toEqual([
      { kind: 'sub', children: [{ kind: 'text', text: '2' }] },
    ]);
  });

  it('mixes subscript with surrounding text (H~2~O)', () => {
    expect(parseInline('H~2~O')).toEqual([
      { kind: 'text', text: 'H' },
      { kind: 'sub', children: [{ kind: 'text', text: '2' }] },
      { kind: 'text', text: 'O' },
    ]);
  });

  it('treats unbalanced ^ as literal text', () => {
    expect(parseInline('^unclosed')).toEqual([
      { kind: 'text', text: '^unclosed' },
    ]);
  });

  it('treats a lone ^ as literal', () => {
    expect(parseInline('^')).toEqual([{ kind: 'text', text: '^' }]);
  });

  it('treats empty ^^ as literal (no zero-width superscript)', () => {
    expect(parseInline('^^')).toEqual([{ kind: 'text', text: '^^' }]);
  });

  it('treats unbalanced ~ as literal text', () => {
    expect(parseInline('~unclosed')).toEqual([
      { kind: 'text', text: '~unclosed' },
    ]);
  });

  it('treats empty ~~ as literal (no zero-width subscript)', () => {
    expect(parseInline('~~')).toEqual([{ kind: 'text', text: '~~' }]);
  });

  it('mixes superscript and subscript with bold, em, and action symbols', () => {
    expect(parseInline('**b** ^U^ ~2~ :a:')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
      { kind: 'text', text: ' ' },
      { kind: 'sup', children: [{ kind: 'text', text: 'U' }] },
      { kind: 'text', text: ' ' },
      { kind: 'sub', children: [{ kind: 'text', text: '2' }] },
      { kind: 'text', text: ' ' },
      { kind: 'action', symbol: ':a:' },
    ]);
  });

  it('does not nest — superscript inside bold stays literal', () => {
    // Same no-nesting rule as `*inner*` inside `**bold**`: the inner `^U^`
    // is literal text within the strong, not a nested superscript.
    expect(parseInline('**bold^U^**')).toEqual([
      { kind: 'strong', children: [{ kind: 'text', text: 'bold^U^' }] },
    ]);
  });

  it('pairs two stray carets on a line into one superscript', () => {
    // Documented tradeoff of the single-`^` delimiter: like `*`/`_`, two loose
    // carets bind as one span. `^2 y^` becomes a superscript here.
    expect(parseInline('x^2 y^2')).toEqual([
      { kind: 'text', text: 'x' },
      { kind: 'sup', children: [{ kind: 'text', text: '2 y' }] },
      { kind: 'text', text: '2' },
    ]);
  });
});
