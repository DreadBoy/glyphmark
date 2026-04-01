import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { convert } from "../../src/pipeline.js";

const VISUAL_DIR = path.resolve(import.meta.dirname, ".");

// A4-ish at 96 DPI
const VIEWPORT = { width: 816, height: 1056 };

// Discover fixture directories (contain input.scribe)
const fixtureDirs = fs
  .readdirSync(VISUAL_DIR, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(path.join(VISUAL_DIR, d.name, "input.scribe")),
  )
  .map((d) => d.name)
  .sort();

describe("visual regression", { timeout: 120_000 }, () => {
  let browser: Browser;
  let page: Page;

  before(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setViewportSize(VIEWPORT);
  });

  after(async () => {
    await browser?.close();
  });

  for (const dir of fixtureDirs) {
    const fixtureDir = path.join(VISUAL_DIR, dir);

    it(`generates screenshot for ${dir}`, async () => {
      const scribeInput = fs.readFileSync(
        path.join(fixtureDir, "input.scribe"),
        "utf-8",
      );

      // Convert to HTML
      const html = convert(scribeInput);

      // Write HTML output
      const htmlPath = path.join(fixtureDir, "output.html");
      fs.writeFileSync(htmlPath, html, "utf-8");

      // Load in browser and screenshot
      await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);

      const pngPath = path.join(fixtureDir, "output.png");
      await page.screenshot({ path: pngPath, fullPage: true });

      // Sanity checks
      assert.ok(fs.existsSync(htmlPath), `HTML file should exist: ${htmlPath}`);
      assert.ok(fs.existsSync(pngPath), `PNG file should exist: ${pngPath}`);
      assert.ok(
        fs.statSync(pngPath).size > 0,
        `PNG should be non-empty for ${dir}`,
      );
    });
  }
});
