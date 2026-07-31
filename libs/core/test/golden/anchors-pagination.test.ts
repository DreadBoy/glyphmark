import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { parseGlyph } from '../../src/parser';
import { renderToHtml } from '../../src/renderer/render';
import { END_LINE_ATTR, LINE_ATTR } from '../../src/renderer/source-anchors';
import { GOLDEN_DIR } from './fixtures';

// Matches the screen viewport the screenshot suite paginates against, so this
// exercises the same layout the preview shows.
const VIEWPORT = { width: 994, height: 1123 };

const SKIP = !!process.env.SKIP_SCREENSHOTS;

/**
 * The assumption the IntelliJ plugin's scroll sync rests on: paged.js *moves*
 * the rendered nodes into its page boxes rather than recreating them, so the
 * `data-glyph-line` attributes ride along and the elements still measure once
 * pagination has finished.
 *
 * If that ever stopped being true the anchors would still be in the HTML the
 * renderer produced — the suite in `anchors.test.ts` would stay green — and
 * scroll sync would silently do nothing. Hence a separate, browser-backed test
 * that asserts it against a real paginated document.
 */
describe.skipIf(SKIP)('source anchors survive pagination', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('leaves every anchor inside a page box, measurable and ordered', async () => {
    // A fixture that genuinely paginates and covers blocks, tables and lists.
    const input = fs.readFileSync(
      path.join(GOLDEN_DIR, 'item-canonical', 'input.glyph'),
      'utf-8',
    );
    const html = renderToHtml(parseGlyph(input), { sourceAnchors: true });

    if (!browser) throw new Error('browser not initialised');
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForSelector('.pagedjs_pages', { timeout: 30_000 });

    const measured = await page.evaluate(
      ({ lineAttr, endAttr }) => {
        const root = document.querySelector('.pagedjs_pages');
        if (!root) return null;
        return [
          ...root.querySelectorAll<HTMLElement>(
            `[${lineAttr}]:not([data-split-from])`,
          ),
        ].map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            line: Number(el.getAttribute(lineAttr)),
            endLine: Number(el.getAttribute(endAttr)),
            height: rect.height,
          };
        });
      },
      { lineAttr: LINE_ATTR, endAttr: END_LINE_ATTR },
    );

    await context.close();

    if (!measured)
      throw new Error('no .pagedjs_pages in the rendered document');
    // Anchors made it into the laid-out pages at all — the whole point.
    expect(measured.length).toBeGreaterThan(0);

    // Document order inside the page boxes is still source order, which is
    // what `lineToOffset`'s binary search depends on.
    let previous = 0;
    for (const { line, endLine } of measured) {
      expect(line).toBeGreaterThanOrEqual(previous);
      expect(endLine).toBeGreaterThanOrEqual(line);
      previous = line;
    }

    // At least some anchors have a real box to interpolate within; zero-height
    // everywhere would mean the elements were cloned rather than moved.
    expect(measured.some((m) => m.height > 0)).toBe(true);
  }, 60_000);
});
