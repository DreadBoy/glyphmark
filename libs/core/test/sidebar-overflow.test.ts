import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { parseGlyph } from '../src/parser';
import { renderToHtml } from '../src/renderer/render';

const SKIP = !!process.env.SKIP_SCREENSHOTS;

const WORDS =
  'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango'.split(
    ' ',
  );
const para = (i: number, n: number) =>
  `Paragraph ${i}. ` +
  Array.from({ length: n }, (_, k) => WORDS[(i + k) % 20]).join(' ');
const paras = (from: number, to: number, n = 60) =>
  Array.from({ length: to - from }, (_, j) => [para(from + j, n), '']).flat();

// The repro from #39: a rail about three pages tall, then `bodyTo - 3`
// paragraphs of body text.
function railDocument(bodyTo: number): string {
  return [
    '# Rail test',
    '',
    ...paras(1, 3),
    '=',
    'sidebar(',
    '## TALL SIDEBAR',
    '',
    ...paras(200, 214, 50),
    ')',
    '',
    '# Rail page',
    '',
    ...paras(3, bodyTo),
  ].join('\n');
}

const RAIL_TEXT = ['TALL SIDEBAR', ...paras(200, 214, 50).filter(Boolean)]
  .join('')
  .replace(/\s+/g, '');

interface RailPage {
  sidebarPage: boolean;
  overflows: boolean;
  bodyChars: number;
  text: string;
}

let browser: Browser | undefined;

beforeAll(async () => {
  if (!SKIP) browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

async function layOut(source: string): Promise<RailPage[]> {
  if (!browser) throw new Error('browser not initialised');
  const html = renderToHtml(parseGlyph(source)).replace(
    '<head>',
    '<head><script>window.PagedConfig = { after: () => { window.__laidOut = true; } };</script>',
  );
  const page = await browser.newPage();
  try {
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => (globalThis as Record<string, unknown>).__laidOut,
    );
    return await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.gm-sidebar-rail')].map(
        (rail) => {
          const pageEl = rail.closest('.pagedjs_page');
          const flow = pageEl?.querySelector('.pagedjs_page_content > div');
          return {
            sidebarPage: !!pageEl?.classList.contains('gm-sidebar-page'),
            overflows: rail.scrollHeight > rail.clientHeight + 1,
            bodyChars: flow?.textContent?.trim().length ?? 0,
            text: rail.textContent ?? '',
          };
        },
      ),
    );
  } finally {
    await page.close();
  }
}

/**
 * A rail taller than its page used to be broken across pages by paged.js as
 * part of the body flow: pages holding only the rail, then the rest of it on
 * an ordinary page, printed over the body text (#39). It now continues in
 * the rail strip of the following pages.
 */
describe.skipIf(SKIP)(
  'sidebar() taller than a page',
  { timeout: 60_000 },
  () => {
    it('continues the rail next to the body text of the following pages', async () => {
      const rails = await layOut(railDocument(40));
      expect(rails.length).toBeGreaterThan(1);
      for (const rail of rails) {
        expect(rail.sidebarPage).toBe(true);
        expect(rail.overflows).toBe(false);
        expect(rail.bodyChars).toBeGreaterThan(0);
      }
      expect(
        rails
          .map((r) => r.text)
          .join('')
          .replace(/\s+/g, ''),
      ).toBe(RAIL_TEXT);
    });

    it('adds pages for the rest of the rail when the body ends first', async () => {
      const rails = await layOut(railDocument(5));
      expect(rails.length).toBeGreaterThan(1);
      for (const rail of rails) {
        expect(rail.sidebarPage).toBe(true);
        expect(rail.overflows).toBe(false);
      }
      expect(
        rails
          .map((r) => r.text)
          .join('')
          .replace(/\s+/g, ''),
      ).toBe(RAIL_TEXT);
    });
  },
);
