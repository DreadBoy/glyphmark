import { afterAll, beforeAll, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { type Browser, chromium, type Page } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { convert } from '../../src/pipeline.js';

const VISUAL_DIR = path.resolve(import.meta.dirname, '.');
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === '1';
const IMPORT_GOLDENS = process.env.IMPORT_GOLDENS === '1';

// A4-ish at 96 DPI
const VIEWPORT = { width: 1300, height: 1056 };

// Max allowed pixel diff ratio (0 = exact match)
const DIFF_THRESHOLD = 0;

// Discover fixture directories (contain input.scribe)
const fixtureDirs = fs
  .readdirSync(VISUAL_DIR, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(path.join(VISUAL_DIR, d.name, 'input.scribe')),
  )
  .map((d) => d.name)
  .sort();

function comparePngs(
  actualPath: string,
  goldenPath: string,
  diffPath: string,
): { match: boolean; diffPixels: number; totalPixels: number } {
  const actualBuf = fs.readFileSync(actualPath);
  const goldenBuf = fs.readFileSync(goldenPath);
  const actual = PNG.sync.read(actualBuf);
  const golden = PNG.sync.read(goldenBuf);

  // If dimensions differ, pad the smaller image to match
  const width = Math.max(actual.width, golden.width);
  const height = Math.max(actual.height, golden.height);

  function padImage(img: PNG, w: number, h: number): Buffer {
    if (img.width === w && img.height === h) return img.data;
    const padded = Buffer.alloc(w * h * 4, 0);
    for (let y = 0; y < img.height; y++) {
      const srcOffset = y * img.width * 4;
      const dstOffset = y * w * 4;
      img.data.copy(padded, dstOffset, srcOffset, srcOffset + img.width * 4);
    }
    return padded;
  }

  const actualData = padImage(actual, width, height);
  const goldenData = padImage(golden, width, height);
  const diff = new PNG({ width, height });

  const diffPixels = pixelmatch(
    actualData,
    goldenData,
    diff.data,
    width,
    height,
    { threshold: 0 },
  );

  if (diffPixels > 0) {
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }

  const totalPixels = width * height;
  return {
    match: diffPixels / totalPixels <= DIFF_THRESHOLD,
    diffPixels,
    totalPixels,
  };
}

describe('golden snapshots', { timeout: 120_000 }, () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setViewportSize(VIEWPORT);
  });

  afterAll(async () => {
    await browser?.close();
  });

  for (const dir of fixtureDirs) {
    const fixtureDir = path.join(VISUAL_DIR, dir);

    it.skip(`${dir}`, async () => {
      const scribeInput = fs.readFileSync(
        path.join(fixtureDir, 'input.scribe'),
        'utf-8',
      );

      if (IMPORT_GOLDENS) {
        await page.goto('https://scribe.pf2.tools/', {
          waitUntil: 'networkidle',
        });
        // Clear Ace editor and paste input.scribe
        const setValueScript =
          "(() => { const editor = document.querySelector('.ace_editor').env.editor;" +
          ' editor.setValue(' +
          JSON.stringify(scribeInput) +
          ', -1); })()';
        await page.evaluate(setValueScript);
        await page.waitForTimeout(500);
        // Strip chrome to isolate result
        await page.evaluate(`(() => {
          document.querySelectorAll(".flex-even.shadow, .m-4.small.op-50, .position-fixed.print-hide").forEach((el) => el.remove());
          const rs = document.querySelector("#result-scroller");
          if (rs) rs.classList.remove("overflow-scroll");
          document.body.classList.remove("bg-img");
          document.querySelectorAll(".bg-paper").forEach((el) => { el.style.background = "#eee"; });
        })()`);
        await page.waitForTimeout(200);
        const goldenPath = path.join(fixtureDir, 'golden.png');
        await page.screenshot({ path: goldenPath, fullPage: true });
        return;
      }

      // Convert to HTML
      const html = convert(scribeInput);

      // Write HTML output
      const htmlPath = path.join(fixtureDir, 'output.html');
      fs.writeFileSync(htmlPath, html, 'utf-8');

      // Load in browser and screenshot
      // page.setContent doesn't trigger LCD antialiasing, only grayscale one. So we use page.goto()
      // We use data URI to avoid file system access and potential issues with stale .html files
      const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      await page.goto(dataUri, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const pngPath = path.join(fixtureDir, 'output.png');
      await page.screenshot({ path: pngPath, fullPage: true });

      assert.ok(
        fs.statSync(pngPath).size > 0,
        `PNG should be non-empty for ${dir}`,
      );

      const goldenPath = path.join(fixtureDir, 'golden.png');
      const diffPath = path.join(fixtureDir, 'diff.png');

      if (UPDATE_SNAPSHOTS) {
        // Update mode: copy output to golden
        fs.copyFileSync(pngPath, goldenPath);
      } else {
        // Comparison mode: golden must exist
        assert.ok(
          fs.existsSync(goldenPath),
          `Golden snapshot missing for ${dir}. Run npm run test:visual:update first.`,
        );

        const result = comparePngs(pngPath, goldenPath, diffPath);
        assert.ok(
          result.match,
          `Visual regression in ${dir}: ${result.diffPixels}/${result.totalPixels} pixels differ. See ${diffPath}`,
        );

        // Clean up diff file if test passed
        if (fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
      }
    });
  }
});
