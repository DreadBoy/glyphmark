import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { parseGlyph } from '../src/parser';
import { renderToHtml } from '../src/renderer/render';

// A4 at 96 DPI, the print viewport the golden suite uses.
const VIEWPORT = { width: 794, height: 1123 };

const SKIP = !!process.env.SKIP_SCREENSHOTS;

const WORDS =
  'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango'.split(
    ' ',
  );
const para = (i: number, n = 60) =>
  `Paragraph ${i}. ` +
  Array.from({ length: n }, (_, k) => WORDS[(i + k) % WORDS.length]).join(' ');
const paras = (from: number, to: number, n = 60) =>
  Array.from({ length: to - from }, (_, j) => [para(from + j, n), '']).flat();

interface Measured {
  page: number;
  text: string;
  left: number;
  width: number;
}

/**
 * A full-width band (`/` … `/`) has to keep spanning both columns on every
 * page it runs onto, not just the page its opening `/` lands on (#38). The
 * golden fixtures are all one page, so this is checked against a real
 * paginated document by measuring the laid-out elements.
 */
describe.skipIf(SKIP)('full-width bands across page breaks', () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  // Every paragraph and h1 per page, with its laid-out position, plus the
  // page's content box (the full-width measure).
  async function layout(source: string) {
    if (!browser) throw new Error('browser not initialised');
    const html = renderToHtml(parseGlyph(source)).replace(
      '<head>',
      '<head><script>window.PagedConfig = { after: () => { window.__paged = true; } };</script>',
    );
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => (globalThis as Record<string, unknown>).__paged,
      null,
      { timeout: 30_000 },
    );
    const result = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('.pagedjs_page')];
      const content = pages[0].querySelector('.pagedjs_page_content');
      if (!content) return null;
      const box = content.getBoundingClientRect();
      const elements = pages.flatMap((pg, i) =>
        [...pg.querySelectorAll<HTMLElement>('p, h1')].map((el) => ({
          page: i + 1,
          text: (el.textContent ?? '').trim(),
          left: el.getBoundingClientRect().left,
          width: el.getBoundingClientRect().width,
        })),
      );
      return {
        full: box.width,
        middle: box.left + box.width / 2,
        elements,
      };
    });
    await context.close();
    if (!result) throw new Error('no paged.js page in the rendered document');
    return result;
  }

  const isFull = (m: Measured, full: number) => m.width > full * 0.9;
  const starting = (elements: Measured[], prefix: string) => {
    const found = elements.find((m) => m.text.startsWith(prefix));
    if (!found) throw new Error(`no element starting with "${prefix}"`);
    return found;
  };
  const paragraphNumber = (m: Measured) =>
    Number(/^Paragraph (\d+)\./.exec(m.text)?.[1] ?? NaN);

  it('keeps a band longer than a page full-width on the next page', async () => {
    const { full, elements } = await layout(
      [
        '# Band test',
        '',
        '/',
        '',
        ...paras(1, 31),
        '/',
        '',
        '# After the band',
        '',
        ...paras(31, 37),
      ].join('\n'),
    );

    const band = elements.filter((m) => paragraphNumber(m) <= 30);
    // The band really does run onto a second page.
    expect(new Set(band.map((m) => m.page)).size).toBeGreaterThan(1);
    for (const m of band) expect(isFull(m, full), m.text).toBe(true);

    // Two columns again once the band is closed.
    const after = starting(elements, 'After the band');
    expect(isFull(after, full)).toBe(false);
  }, 60_000);

  it('keeps a full-width rule() box full-width when it moves to the next page', async () => {
    const { full, middle, elements } = await layout(
      [
        '# Rule test',
        '',
        ...paras(1, 14),
        '/',
        'rule(',
        '# FULL-WIDTH BOX',
        '',
        ...paras(100, 103, 40),
        '|',
        '',
        ...paras(103, 106, 40),
        ')',
        '/',
        '',
        ...paras(14, 22),
      ].join('\n'),
    );

    const box = starting(elements, 'FULL-WIDTH BOX');
    // The box doesn't fit on page 1 and moves on.
    expect(box.page).toBe(2);
    // Its own two inner columns span the page: the second one starts in the
    // right half. Squeezed into a page column, both would sit in the left.
    const innerRight = starting(elements, 'Paragraph 103.');
    expect(innerRight.page).toBe(2);
    expect(innerRight.left).toBeGreaterThan(middle);

    // The body text after it comes back to column width and follows the box
    // rather than running beside it.
    const next = starting(elements, 'Paragraph 14.');
    expect(next.page).toBe(2);
    expect(isFull(next, full)).toBe(false);
  }, 60_000);
});
