import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { convert } from '../../src/pipeline';

const HERE = path.resolve(import.meta.dirname, '.');

// Toggle live reload in the saved output.html. Default off; set OUTPUT_HTML=1
// when iterating in a browser via livejs.
const OUTPUT_HTML = !!process.env.OUTPUT_HTML;

// Promote the current output.png to golden.png. For initial seeding only —
// regular runs must not need this. The user's standing rule is "never
// auto-update goldens; fix the code to match them." Use sparingly.
const UPDATE_GOLDENS = !!process.env.UPDATE_GOLDENS;

// Skip the screenshot half of the suite. Useful when iterating on the parser
// alone or in environments where chromium can't launch.
const SKIP_SCREENSHOTS = !!process.env.SKIP_SCREENSHOTS;

// Print viewport — A4 at 96 DPI (210mm × 297mm). Matches @page size so
const PRINT_VIEWPORT = { width: 794, height: 1123 };
// Screen viewport — wider so the per-page drop shadow has room on both
// sides (and so any horizontal overflow shows up in the screenshot instead
// of being clipped by the viewport).
const SCREEN_VIEWPORT = { width: 994, height: 1123 };

// Tolerance for pixel diffs. `ratio` is mismatched-pixels / total; sub-pixel
// font hinting can flip a few pixels even on identical input, so allow a
// small slack. Tighten if false-passes start sneaking through.
const PIXELMATCH_THRESHOLD = 0.1; // per-pixel color distance (pixelmatch arg)
const MAX_DIFF_RATIO = 0.001; // 0.1% of total pixels

// Pull every fixture into the Vite module graph so vitest's watcher reruns
// when any of them change. The test still reads them via fs.readFileSync to
// keep file paths handy for writing OUTPUT_HTML next to the input — the eager
// import is purely for change tracking.
import.meta.glob('./*/input{,.skip,.todo}.glyph', {
  query: '?raw',
  eager: true,
});

// Discover fixture directories. A fixture marker file decides its mode:
// - `input.glyph`        → regular test
// - `input.skip.glyph`   → skipped (it.skip)
// - `input.todo.glyph`   → todo (it.todo) — body is a note describing the
//   block and the source book page; not parsed/rendered.
type Mode = 'run' | 'skip' | 'todo';
const fixtures = fs
  .readdirSync(HERE, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => {
    const dir = d.name;
    const todoPath = path.join(HERE, dir, 'input.todo.glyph');
    const skipPath = path.join(HERE, dir, 'input.skip.glyph');
    const inputPath = path.join(HERE, dir, 'input.glyph');
    if (fs.existsSync(todoPath))
      return [{ dir, inputPath: todoPath, mode: 'todo' as Mode }];
    if (fs.existsSync(skipPath))
      return [{ dir, inputPath: skipPath, mode: 'skip' as Mode }];
    if (fs.existsSync(inputPath))
      return [{ dir, inputPath, mode: 'run' as Mode }];
    return [];
  })
  .sort((a, b) => a.dir.localeCompare(b.dir));

// One chromium instance for the whole file. Pages are cheap; launching the
// browser is not.
let browser: Browser | undefined;

beforeAll(async () => {
  if (SKIP_SCREENSHOTS) return;
  browser = await chromium.launch();
}, 30_000);

afterAll(async () => {
  await browser?.close();
});

type Media = 'screen' | 'print';

async function renderPng(html: string, media: Media): Promise<Buffer> {
  if (!browser) throw new Error('browser not initialised');
  const ctx = await browser.newContext({
    viewport: media === 'print' ? PRINT_VIEWPORT : SCREEN_VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  // Set media BEFORE setContent so @media rules are correct from first paint.
  // Paged.js paginates either way (it processes @page directly), but @media
  // print/screen rules layer on top — print mode strips screen-only chrome.
  await page.emulateMedia({ media });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForSelector('.pagedjs_pages', { timeout: 30_000 });
  const buf = await page.screenshot({ fullPage: true, type: 'png' });
  await ctx.close();
  return buf;
}

// Returns mismatched-pixel count from pixelmatch, plus the diff PNG bytes.
// Throws if the two images don't share the same dimensions — that's a
// structural change, not a pixel drift, and should surface loudly.
function diffPngs(
  actualBuf: Buffer,
  expectedBuf: Buffer,
): { mismatched: number; total: number; diffPng: Buffer } {
  const actual = PNG.sync.read(actualBuf);
  const expected = PNG.sync.read(expectedBuf);
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `screenshot size differs from golden: actual=${actual.width}x${actual.height} expected=${expected.width}x${expected.height}`,
    );
  }
  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(
    actual.data,
    expected.data,
    diff.data,
    width,
    height,
    { threshold: PIXELMATCH_THRESHOLD },
  );
  return { mismatched, total: width * height, diffPng: PNG.sync.write(diff) };
}

describe('golden snapshots', { timeout: 120_000 }, () => {
  for (const { dir, inputPath, mode } of fixtures) {
    if (mode === 'todo') {
      it.todo(`${dir}`);
      continue;
    }
    const test = mode === 'skip' ? it.skip : it;

    test(`${dir}`, async () => {
      const input = fs.readFileSync(inputPath, 'utf-8');
      const html = convert(input);
      expect(html.length).toBeGreaterThan(0);

      const fixtureDir = path.join(HERE, dir);
      if (OUTPUT_HTML) {
        fs.writeFileSync(
          path.join(fixtureDir, 'output.html'),
          html.replace(
            '</head>',
            '<script type="text/javascript" src="https://livejs.com/live.js"></script></head>',
          ),
        );
      }

      if (SKIP_SCREENSHOTS) return;

      // Each fixture compares two media: screen (with preview chrome) and
      // print (paginated as it would print). Both are checked; the test only
      // passes if both are within tolerance.
      const failures: string[] = [];
      for (const media of ['screen', 'print'] as const) {
        const outputPng = await renderPng(html, media);
        const outputPngPath = path.join(fixtureDir, `output.${media}.png`);
        fs.writeFileSync(outputPngPath, outputPng);

        const goldenPath = path.join(fixtureDir, `golden.${media}.png`);
        const diffPath = path.join(fixtureDir, `diff.${media}.png`);

        if (UPDATE_GOLDENS) {
          fs.writeFileSync(goldenPath, outputPng);
          // Stale diff from a prior failing run isn't meaningful any more.
          if (fs.existsSync(diffPath)) fs.unlinkSync(diffPath);
          continue;
        }

        if (!fs.existsSync(goldenPath)) {
          // No golden yet — the fixture is in "produce, don't compare" mode.
          // Drop any stale diff from earlier runs so it doesn't mislead.
          if (fs.existsSync(diffPath)) fs.unlinkSync(diffPath);
          continue;
        }

        const expected = fs.readFileSync(goldenPath);
        const { mismatched, total, diffPng } = diffPngs(outputPng, expected);

        if (mismatched === 0) {
          if (fs.existsSync(diffPath)) fs.unlinkSync(diffPath);
          continue;
        }

        fs.writeFileSync(diffPath, diffPng);
        const ratio = mismatched / total;
        if (ratio > MAX_DIFF_RATIO) {
          failures.push(
            `${media}: drifted from golden (${mismatched}/${total} px = ${(
              ratio * 100
            ).toFixed(3)}%); see ${path.relative(HERE, diffPath)}`,
          );
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
});
