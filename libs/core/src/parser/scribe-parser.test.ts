import { describe, it, expect } from 'vitest';
import { parseScribe } from './scribe-parser';

describe('parseScribe', () => {
  describe('metadata extraction', () => {
    it('extracts watermark', () => {
      const doc = parseScribe('watermark (\nHello World\n)\n\nSome text');
      expect(doc.watermark).toBe('Hello World');
    });

    it('extracts title', () => {
      const doc = parseScribe('title (\nMy Title\n)\n\nSome text');
      expect(doc.title).toBe('My Title');
    });

    it('extracts custom CSS', () => {
      const doc = parseScribe('css (\n.foo { color: red; }\n)\n\nSome text');
      expect(doc.customCss).toBe('.foo { color: red; }');
    });

    it('extracts fonts', () => {
      const doc = parseScribe(
        'fonts(\nRoboto:wght@400;700\nOpen Sans:wght@300\n)\n\nSome text',
      );
      expect(doc.fonts).toEqual(['Roboto:wght@400;700', 'Open Sans:wght@300']);
    });

    it('detects pagenumbers', () => {
      const doc = parseScribe('pagenumbers\n\nSome text');
      expect(doc.pageNumbers).toBe(true);
    });

    it('defaults pagenumbers to false', () => {
      const doc = parseScribe('Some text');
      expect(doc.pageNumbers).toBe(false);
    });
  });

  describe('content references', () => {
    it('extracts content ref definitions', () => {
      const doc = parseScribe('myref {\nHello world\n}\n\nSome text');
      expect(doc.contentRefs.get('myref')).toBe('Hello world');
    });

    it('strips definitions from body', () => {
      const doc = parseScribe('myref {\nHello\n}\n\nVisible text');
      const hasRef = doc.body.some(
        (n) => n.type === 'paragraph' && n.content.includes('myref {'),
      );
      expect(hasRef).toBe(false);
    });

    it('extracts refs from hidden section', () => {
      const doc = parseScribe(
        'Visible\n\n%\n\nsecret {\nnote(\n# Hidden\nContent here\n)\n}',
      );
      expect(doc.contentRefs.has('secret')).toBe(true);
    });

    it('extracts refs from HTML comments', () => {
      const doc = parseScribe(
        '<!--\ncommented {\nInside comment\n}\n-->\n\nVisible',
      );
      expect(doc.contentRefs.has('commented')).toBe(true);
    });

    it('preserves {{key}} in body for rendering', () => {
      const doc = parseScribe('myref {\nHello\n}\n\n{{myref}}');
      const hasMustache = doc.body.some(
        (n) => n.type === 'paragraph' && n.content.includes('{{myref}}'),
      );
      expect(hasMustache).toBe(true);
    });
  });

  describe('block parsing', () => {
    it('parses page breaks', () => {
      const doc = parseScribe('Text\n\n=\n\nMore text');
      expect(doc.body.some((n) => n.type === 'page-break')).toBe(true);
    });

    it('parses column breaks', () => {
      const doc = parseScribe('Text\n\n|\n\nMore text');
      expect(doc.body.some((n) => n.type === 'column-break')).toBe(true);
    });

    it('parses end columns', () => {
      const doc = parseScribe('Text\n\n/\n\nMore text');
      expect(doc.body.some((n) => n.type === 'end-columns')).toBe(true);
    });

    it('parses head block', () => {
      const doc = parseScribe('head (\n# Title\nDesc\n-\n)');
      const head = doc.body.find((n) => n.type === 'head');
      expect(head).toBeDefined();
    });

    it('parses info block', () => {
      const doc = parseScribe('info (\n## Info Title\nContent\n)');
      const info = doc.body.find((n) => n.type === 'info');
      expect(info).toBeDefined();
    });
  });

  describe('item block parsing', () => {
    it('parses item with name and action', () => {
      const doc = parseScribe(
        'item(\n# Cool Feat :a:\n## Feat 3\n-\n; uncommon,class\nContent\n-\nBody text\n)',
      );
      const item = doc.body.find((n) => n.type === 'item');
      expect(item).toBeDefined();
      if (item?.type === 'item') {
        expect(item.name).toBe('Cool Feat');
        expect(item.nameActions).toBe(':a:');
        expect(item.subtitle).toBe('Feat 3');
        expect(item.traits).toEqual(['uncommon', 'class']);
      }
    });

    it('parses item without traits', () => {
      const doc = parseScribe(
        'item(\n# Jennifer\n-\n### lg female champion\n)',
      );
      const item = doc.body.find((n) => n.type === 'item');
      expect(item).toBeDefined();
      if (item?.type === 'item') {
        expect(item.name).toBe('Jennifer');
        expect(item.traits).toEqual([]);
      }
    });
  });

  describe('table parsing', () => {
    it('parses basic table', () => {
      const doc = parseScribe(
        'Header 1 | Header 2\n--- | :---:\nCell 1 | Cell 2',
      );
      const table = doc.body.find((n) => n.type === 'table');
      expect(table).toBeDefined();
      if (table?.type === 'table') {
        expect(table.headers).toEqual(['Header 1', 'Header 2']);
        expect(table.alignments).toEqual(['left', 'center']);
        expect(table.rows).toHaveLength(1);
      }
    });

    it('parses table footnotes', () => {
      const doc = parseScribe(
        'A | B\n--- | ---\n1 | 2\n. * This is a footnote',
      );
      const table = doc.body.find((n) => n.type === 'table');
      expect(table).toBeDefined();
      if (table?.type === 'table') {
        expect(table.footnotes).toHaveLength(1);
        expect(table.footnotes[0]).toBe('This is a footnote');
      }
    });
  });
});
