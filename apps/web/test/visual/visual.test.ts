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

const VIEWPORT = { width: 1300, height: 1056 };
const DIFF_THRESHOLD = 0.025;
const PREVIEW_PORT = 4300;

type Interaction =
  | { type: "type"; text: string }
  | { type: "key"; key: string }
  | { type: "exec"; script: string };

const fixtureDirs = fs
  .readdirSync(VISUAL_DIR, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      fs.existsSync(path.join(VISUAL_DIR, d.name, "golden.json")),
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

function isEmptyParagraph(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as Record<string, unknown>;
  if (n.type !== "paragraph") return false;
  const content = n.content;
  if (!content || (Array.isArray(content) && content.length === 0)) return true;
  return false;
}

function stripTrailingEmptyParagraphs(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  const result = [...content];
  while (result.length > 0 && isEmptyParagraph(result[result.length - 1])) {
    result.pop();
  }
  return result;
}

function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalize);
  if (typeof node !== "object" || node === null) return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "attrs" && v && typeof v === "object") {
      const cleaned: Record<string, unknown> = {};
      for (const [ak, av] of Object.entries(v as Record<string, unknown>)) {
        if (av === null || av === undefined) continue;
        if (av === false) continue;
        // Table cells default colspan/rowspan to 1; drop to match goldens.
        if ((ak === "colspan" || ak === "rowspan") && av === 1) continue;
        cleaned[ak] = av;
      }
      if (Object.keys(cleaned).length) out[k] = cleaned;
    } else if (
      k === "content" &&
      typeof src.type === "string" &&
      [
        "page",
        "doc",
        "column",
        "leftSidebar",
        "rightSidebar",
        "infoBlock",
        "rulesBlock",
        "noteBlock",
        "mathBlock",
        "headBlock",
        "itemBlock",
      ].includes(src.type)
    ) {
      // Trailing empty paragraphs in containers are editor bookkeeping
      // (cursor landing pads after atom/block inserts, lift-out remnants);
      // not semantically meaningful, so strip before comparing.
      out[k] = normalize(stripTrailingEmptyParagraphs(v));
    } else {
      out[k] = normalize(v);
    }
  }
  return out;
}

async function runInteractions(page: Page, interactions: Interaction[]) {
  const editorSelector = ".ProseMirror";
  await page.click(editorSelector);

  for (const action of interactions) {
    if (action.type === "type") {
      // Per-char delay so slash-menu's setTimeout-based open flag settles
      // before subsequent characters race ahead of it.
      await page.keyboard.type(action.text, { delay: 20 });
    } else if (action.type === "key") {
      await page.keyboard.press(action.key);
      // Give ProseMirror time to settle a multi-step command chain
      // (e.g. liftEmptyBlock falling through to splitBlock).
      await page.waitForTimeout(50);
    } else if (action.type === "exec") {
      // Runs a script against the editor. Used to simulate non-keyboard
      // actions (toolbar buttons, modal dialogs) that will eventually have
      // real UI but don't yet.
      await page.evaluate((script) => {
        const editor = (window as any).__glyphmark_editor;
        // eslint-disable-next-line no-new-func
        new Function("editor", script)(editor);
      }, action.script);
      await page.waitForTimeout(20);
    } else {
      throw new Error(`Unknown interaction type: ${JSON.stringify(action)}`);
    }
  }
}

async function resetEditor(page: Page) {
  await page.evaluate(() => {
    const editor = (window as any).__glyphmark_editor;
    editor.commands.setContent({
      type: "doc",
      content: [
        { type: "page", content: [{ type: "paragraph" }] },
      ],
    });
    editor.commands.focus("end");
  });
}

describe("editor interaction tests", { timeout: 120_000, concurrent: true }, () => {
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
    const interactionsPath = path.join(fixtureDir, "interactions.json");
    const hasInteractions = fs.existsSync(interactionsPath);

    const testFn = hasInteractions ? it : it.skip;

    testFn(`${dir}`, async () => {
      const golden = JSON.parse(
        fs.readFileSync(path.join(fixtureDir, "golden.json"), "utf-8"),
      );
      const interactions: Interaction[] = hasInteractions
        ? JSON.parse(fs.readFileSync(interactionsPath, "utf-8"))
        : [];

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

        await resetEditor(page);
        await runInteractions(page, interactions);

        const actualJson = await page.evaluate(() => {
          return (window as any).__glyphmark_editor.getJSON();
        });

        const actualNorm = normalize(actualJson);
        const goldenNorm = normalize(golden);

        expect(
          actualNorm,
          `Editor state after interactions in ${dir} did not match golden.json`,
        ).toEqual(goldenNorm);

        // Move cursor to doc start so AutoTrimTrailing can collapse the
        // trailing empty paragraph the cursor was parked in, then blur
        // so the caret isn't in the PNG.
        await page.evaluate(() => {
          const editor = (window as any).__glyphmark_editor;
          editor.commands.setTextSelection(0);
          (document.activeElement as HTMLElement | null)?.blur();
        });

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
            `Golden snapshot missing for ${dir}.`,
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
