import { describe, it, expect, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { preview, type PreviewServer } from "vite";

const VISUAL_DIR = path.resolve(import.meta.dirname, ".");
const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === "1";

// A4-ish at 96 DPI (matches core visual tests)
const VIEWPORT = { width: 816, height: 1056 };

// Max allowed pixel diff ratio (allows minor differences from TipTap's DOM structure)
const DIFF_THRESHOLD = 0.025;

const PREVIEW_PORT = 4300;

// Discover fixture directories (contain input.json)
const fixtureDirs = fs
  .readdirSync(VISUAL_DIR, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(path.join(VISUAL_DIR, d.name, "input.json")),
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

describe("editor golden snapshots", { timeout: 120_000, concurrent: true }, () => {
  let browser: Browser;
  let server: PreviewServer;

  beforeAll(async () => {
    server = await preview({
      root: path.resolve(VISUAL_DIR, "../../../.."),
      build: { outDir: "dist/apps/web" },
      preview: { port: PREVIEW_PORT, host: "localhost", strictPort: true },
    });

    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    server?.httpServer?.close();
  });

  for (const dir of fixtureDirs) {
    const fixtureDir = path.join(VISUAL_DIR, dir);

    it(`${dir}`, async () => {
      const inputJson = JSON.parse(
        fs.readFileSync(path.join(fixtureDir, "input.json"), "utf-8"),
      );

      // Each test gets its own tab
      const page = await browser.newPage();
      await page.setViewportSize(VIEWPORT);

      try {
        await page.goto(`http://localhost:${PREVIEW_PORT}/`, {
          waitUntil: "networkidle",
        });

        await page.waitForFunction(
          () => (window as any).__glyphmark_editor?.isEditable,
          null,
          { timeout: 10_000 },
        );

        await page.evaluate((json) => {
          (window as any).__glyphmark_editor.commands.setContent(json);
        }, inputJson);

        await page.waitForFunction(() =>
          (document as any).fonts.ready.then(() => true),
        );
        await page.waitForTimeout(500);

        const pngPath = path.join(fixtureDir, "output.png");
        await page.screenshot({ path: pngPath, fullPage: true });

        assert.ok(
          fs.statSync(pngPath).size > 0,
          `PNG should be non-empty for ${dir}`,
        );

        const goldenPath = path.join(fixtureDir, "golden.png");
        const diffPath = path.join(fixtureDir, "diff.png");

        if (UPDATE_SNAPSHOTS) {
          fs.copyFileSync(pngPath, goldenPath);
        } else {
          assert.ok(
            fs.existsSync(goldenPath),
            `Golden snapshot missing for ${dir}. Run nx run web:test:update-goldens first.`,
          );

          const result = comparePngs(pngPath, goldenPath, diffPath);
          assert.ok(
            result.match,
            `Visual regression in ${dir}: ${result.diffPixels}/${result.totalPixels} pixels differ. See ${diffPath}`,
          );

          if (fs.existsSync(diffPath)) {
            fs.unlinkSync(diffPath);
          }
        }
      } finally {
        await page.close();
      }
    });
  }
});
