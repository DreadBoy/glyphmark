import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parseGlyph } from '../../src/parser';
import { renderToHtml } from '../../src/renderer/render';
import { END_LINE_ATTR, LINE_ATTR } from '../../src/renderer/source-anchors';
import { discoverFixtures } from './fixtures';

// Pull every fixture into the Vite module graph so vitest's watcher reruns when
// any of them change; the test reads them through fs to keep paths handy.
import.meta.glob('./*/input{,.skip,.todo}.glyph', {
  query: '?raw',
  eager: true,
});

/**
 * Pins the source-anchor contract that the IntelliJ plugin's scroll sync is
 * built on (see `src/renderer/source-anchors.ts`).
 *
 * The load-bearing property is **monotonicity**: read out of the rendered HTML
 * in document order, `data-glyph-line` never decreases. `lineToOffset` binary
 * searches that array, so a fixture that broke the ordering would not fail
 * loudly — sync would just silently land on the wrong part of the document.
 * Content references are the interesting case: they expand a clone of nodes
 * parsed elsewhere in the file, and only stay ordered because the parser
 * retargets the clone's origins to the call site.
 */
describe('source anchors', () => {
  for (const { dir, inputPath, mode } of discoverFixtures()) {
    if (mode === 'todo') {
      it.todo(`${dir}`);
      continue;
    }
    const test = mode === 'skip' ? it.skip : it;

    test(`${dir}`, () => {
      const input = fs.readFileSync(inputPath, 'utf-8');
      const doc = parseGlyph(input);
      const lineCount = input.split('\n').length;

      const anchored = anchorsIn(renderToHtml(doc, { sourceAnchors: true }));

      expect(anchored.length).toBeGreaterThan(0);

      let previous = 0;
      for (const { line, endLine } of anchored) {
        expect(line).toBeGreaterThanOrEqual(previous);
        expect(line).toBeGreaterThanOrEqual(1);
        expect(endLine).toBeGreaterThanOrEqual(line);
        expect(endLine).toBeLessThanOrEqual(lineCount);
        previous = line;
      }
    });
  }

  it('emits nothing unless asked', () => {
    const doc = parseGlyph('Hello world.\n');
    expect(renderToHtml(doc)).not.toContain(LINE_ATTR);
    expect(renderToHtml(doc, { sourceAnchors: true })).toContain(LINE_ATTR);
  });
});

/** Anchor attribute pairs, in the order they appear in the markup. */
function anchorsIn(html: string): { line: number; endLine: number }[] {
  const pattern = new RegExp(
    `${LINE_ATTR}="(\\d+)" ${END_LINE_ATTR}="(\\d+)"`,
    'g',
  );
  return [...html.matchAll(pattern)].map((m) => ({
    line: Number(m[1]),
    endLine: Number(m[2]),
  }));
}
