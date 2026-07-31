import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { tokenize } from '../../src/parser';
import { discoverFixtures, GOLDEN_DIR } from './fixtures';
import { serializeTokens } from './token-snapshot';

// Promote the current token stream to the golden. For initial seeding only.
const UPDATE_GOLDENS = !!process.env.UPDATE_GOLDENS;

import.meta.glob('./*/input{,.skip,.todo}.glyph', {
  query: '?raw',
  eager: true,
});

/**
 * Pins the token stream for every golden fixture.
 *
 * Unlike the IR goldens, these are not primarily a regression guard for this
 * package — they are the shared contract between this lexer and the Kotlin port
 * that drives syntax highlighting in the IntelliJ plugin. The same files are
 * read by a Gradle test over there, so either implementation drifting turns one
 * of the two suites red immediately.
 *
 * Scope is deliberately the existing corpus, which is all well-formed input.
 * `BUGS.md` documents how malformed input behaves today, and some of that is
 * behaviour nobody wants to pin; fixtures for it belong with the fixes, not
 * here.
 */
describe('token snapshots', () => {
  for (const { dir, inputPath, mode } of discoverFixtures()) {
    if (mode === 'todo') {
      it.todo(`${dir}`);
      continue;
    }
    const test = mode === 'skip' ? it.skip : it;

    test(`${dir}`, () => {
      const input = fs.readFileSync(inputPath, 'utf-8');
      const actual = serializeTokens(input);

      const goldenPath = path.join(GOLDEN_DIR, dir, 'golden.tokens.json');
      if (UPDATE_GOLDENS || !fs.existsSync(goldenPath)) {
        fs.writeFileSync(goldenPath, actual);
        return;
      }
      expect(actual).toBe(fs.readFileSync(goldenPath, 'utf-8'));
    });
  }
});

/**
 * The contract an IntelliJ `Lexer` requires, checked as a property over every
 * fixture rather than written out case by case. The Kotlin side asserts the
 * same thing, so a port that tokenizes correctly but leaves a hole in its
 * coverage still fails.
 */
describe('token stream tiles the source', () => {
  for (const { dir, inputPath, mode } of discoverFixtures()) {
    if (mode !== 'run') continue;

    it(`${dir}`, () => {
      const input = fs.readFileSync(inputPath, 'utf-8');
      const tokens = tokenize(input);

      expect(tokens).toHaveLength(input.split('\n').length);

      let cursor = 0;
      for (const tok of tokens) {
        expect(tok.span.startOffset).toBe(cursor);
        // +1 for the newline between lines; the last line has none.
        cursor = tok.span.endOffset + 1;

        // Every part lands inside its own line.
        for (const value of Object.values(tok)) {
          if (
            typeof value !== 'object' ||
            value === null ||
            !('start' in value) ||
            !('end' in value)
          )
            continue;
          const part = value as { start: number; end: number };
          expect(part.start).toBeGreaterThanOrEqual(0);
          expect(part.end).toBeLessThanOrEqual(tok.raw.length);
          expect(part.start).toBeLessThanOrEqual(part.end);
        }
      }
      expect(cursor).toBe(input.length + 1);
    });
  }
});
