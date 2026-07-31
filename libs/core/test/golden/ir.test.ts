import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseGlyph } from '../../src/parser';
import { discoverFixtures, GOLDEN_DIR } from './fixtures';
import { serializeIr } from './ir-snapshot';

// Promote the current IR to the golden. For initial seeding only — regular runs
// must not need it. Mirrors UPDATE_GOLDENS in golden.test.ts and carries the
// same standing rule: never auto-update a golden, fix the code to match it.
const UPDATE_GOLDENS = !!process.env.UPDATE_GOLDENS;

// Pull every fixture into the Vite module graph so vitest's watcher reruns when
// any of them change; the test reads them through fs to keep paths handy.
import.meta.glob('./*/input{,.skip,.todo}.glyph', {
  query: '?raw',
  eager: true,
});

/**
 * Pins the IR that `parseGlyph` produces for every golden fixture.
 *
 * The screenshot suite already covers the whole pipeline, but it only fails
 * once a change reaches pixels — a parser change that shifts structure without
 * moving any ink passes it. It also needs chromium, which makes it too slow to
 * sit inside a refactor loop.
 *
 * This suite is the missing middle: it runs in milliseconds, it fails on any
 * structural change, and it is the guard the lexer refactor is steered by. The
 * contract for that refactor is that these snapshots do not move.
 */
describe('IR snapshots', () => {
  for (const { dir, inputPath, mode } of discoverFixtures()) {
    if (mode === 'todo') {
      it.todo(`${dir}`);
      continue;
    }
    const test = mode === 'skip' ? it.skip : it;

    test(`${dir}`, () => {
      const input = fs.readFileSync(inputPath, 'utf-8');
      const actual = serializeIr(parseGlyph(input));

      const fixtureDir = path.join(GOLDEN_DIR, dir);
      const goldenPath = path.join(fixtureDir, 'golden.ir.json');
      const outputPath = path.join(fixtureDir, 'output.ir.json');

      if (UPDATE_GOLDENS || !fs.existsSync(goldenPath)) {
        fs.writeFileSync(goldenPath, actual);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        return;
      }

      const expected = fs.readFileSync(goldenPath, 'utf-8');
      if (actual === expected) {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        return;
      }

      // Leave the actual IR next to the golden so the diff can be inspected
      // with ordinary tools; vitest's inline diff truncates on large documents.
      fs.writeFileSync(outputPath, actual);
      expect(actual, `IR drifted from golden; wrote ${outputPath}`).toBe(
        expected,
      );
    });
  }
});
