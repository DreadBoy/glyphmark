import { describe, it, expect, vi } from 'vitest';
import { ALLOWED_SEGMENTS, parse } from './parser';

describe('parse — preamble', () => {
  it('extracts watermark', () => {
    const doc = parse('watermark(\nDRAFT\n)\n\nBody');
    expect(doc.watermark).toBe('DRAFT');
  });

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

  it('detects pagenumbers keyword', () => {
    const doc = parse('pagenumbers\n\nBody');
    expect(doc.pageNumbers).toBe(true);
  });

  it('defaults pagenumbers to false', () => {
    const doc = parse('Body');
    expect(doc.pageNumbers).toBe(false);
  });
});

describe('parse — content references', () => {
  it('extracts content-ref definitions', () => {
    const doc = parse('myref {\nHello world\n}\n\nBody');
    expect(doc.contentRefs.get('myref')).toBe('Hello world');
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
      'Visible\n\n%\n\nsecret {\nnote(\n# Hidden\nContent\n)\n}',
    );
    expect(doc.contentRefs.has('secret')).toBe(true);
  });

  it('keeps {{key}} placeholders in body', () => {
    const doc = parse('myref {\nHi\n}\n\n{{myref}}');
    const para = doc.body.find((n) => n.type === 'paragraph');
    if (para?.type === 'paragraph') {
      expect(para.content).toEqual([{ kind: 'text', text: '{{myref}}' }]);
    }
  });

  it('extracts refs from inside block contents', () => {
    const doc = parse('note(\nmyref {\nInside\n}\n)');
    expect(doc.contentRefs.get('myref')).toBe('Inside');
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

  it('parses full-width-toggle', () => {
    const doc = parse('A\n\n/\n\nB');
    expect(doc.body.some((n) => n.type === 'full-width-toggle')).toBe(true);
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

  it('parses centered paragraph from ^ marker', () => {
    const doc = parse('^ **Damage** equals level × 2');
    expect(doc.body[0]?.type).toBe('centered-paragraph');
    if (doc.body[0]?.type === 'centered-paragraph') {
      expect(doc.body[0].content).toEqual([
        { kind: 'strong', children: [{ kind: 'text', text: 'Damage' }] },
        { kind: 'text', text: ' equals level × 2' },
      ]);
    }
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
      expect(item.content).toEqual([
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
      expect(item.content).toEqual([
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
      expect(item.content).toEqual([
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

describe('parse — info / note / rules / sample / head / right', () => {
  it('info() splits on column-break', () => {
    const doc = parse('info(\nLeft\n|\nRight\n)');
    const info = doc.body.find((n) => n.type === 'info');
    if (info?.type === 'info') {
      expect(info.content).toEqual([
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

  it('note() retains heading inside', () => {
    const doc = parse('note(\n# Title\nBody text.\n)');
    const n = doc.body.find((n) => n.type === 'note');
    if (n?.type === 'note') {
      expect(n.content[0]).toEqual({
        kind: 'heading',
        level: 1,
        content: [{ kind: 'text', text: 'Title' }],
      });
      expect(n.content[1]?.kind).toBe('paragraph');
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

  it('right() becomes right-sidebar with content', () => {
    const doc = parse('right(\n# Sidebar\nText.\n)');
    const r = doc.body.find((n) => n.type === 'right-sidebar');
    expect(r?.type).toBe('right-sidebar');
  });

});

describe('parse — tables', () => {
  it('parses headers, alignments, and rows', () => {
    const doc = parse('A | B | C\n--- | :---: | ---:\n1 | 2 | 3');
    const table = doc.body.find((n) => n.type === 'table');
    if (table?.type === 'table') {
      expect(table.alignments).toEqual(['left', 'center', 'right']);
      expect(table.headers).toHaveLength(3);
      expect(table.rows).toHaveLength(1);
      expect(table.rows[0]?.[1]).toEqual([{ kind: 'text', text: '2' }]);
    }
  });

  it('captures footnotes', () => {
    const doc = parse('A | B\n--- | ---\n1 | 2\n. * note text');
    const table = doc.body.find((n) => n.type === 'table');
    if (table?.type === 'table') {
      expect(table.footnotes).toHaveLength(1);
      expect(table.footnotes[0]).toEqual([{ kind: 'text', text: 'note text' }]);
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

  it('rules: bold-leading paragraphs get first-line (not hanging) indent', () => {
    const doc = parse('rules(\nFirst.\n\n**Bold** lead.\n)');
    const r = doc.body.find((n) => n.type === 'rules');
    if (r?.type === 'rules') {
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

  it('lists: block-indented in body, flush in rules', () => {
    const docBody = parse('* a\n* b');
    const list = docBody.body.find((n) => n.type === 'list');
    if (list?.type === 'list') expect(list.indent).toBe('block');

    const docRules = parse('rules(\n* a\n* b\n)');
    const r = docRules.body.find((n) => n.type === 'rules');
    if (r?.type === 'rules') {
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
  };

  // How to wrap a snippet in each container's block syntax. `item` requires
  // a leading heading + hr before its content.
  type Container = keyof typeof ALLOWED_SEGMENTS;
  const wrap: Record<Container, (inner: string) => string> = {
    item: (i) => `item(\n# Foo\n-\n${i}\n)`,
    sample: (i) => `sample(\n${i}\n)`,
    rules: (i) => `rules(\n${i}\n)`,
    info: (i) => `info(\n${i}\n)`,
    note: (i) => `note(\n${i}\n)`,
    head: (i) => `head(\n${i}\n)`,
    right: (i) => `right(\n${i}\n)`,
  };

  // Container keyword → matching `BodyNode.type`.
  const blockType: Record<Container, string> = {
    item: 'item',
    sample: 'sample',
    rules: 'rules',
    info: 'info',
    note: 'note',
    head: 'head',
    right: 'right-sidebar',
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

        const doc = parse(wrap[container](KIND_INPUT[kind]!));
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
