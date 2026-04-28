import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convert } from '../../src/pipeline';

const HERE = path.resolve(import.meta.dirname, '.');
const OUTPUT_HTML = !!process.env.OUTPUT_HTML;

// Discover fixture directories. A fixture is skipped if it contains
// `input.skip.scribe` instead of `input.scribe`.
const fixtures = fs
  .readdirSync(HERE, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => {
    const dir = d.name;
    const skipPath = path.join(HERE, dir, 'input.skip.scribe');
    const inputPath = path.join(HERE, dir, 'input.scribe');
    if (fs.existsSync(skipPath))
      return [{ dir, inputPath: skipPath, skip: true }];
    if (fs.existsSync(inputPath))
      return [{ dir, inputPath, skip: false }];
    return [];
  })
  .sort((a, b) => a.dir.localeCompare(b.dir));

describe('golden snapshots', { timeout: 120_000 }, () => {
  for (const { dir, inputPath, skip } of fixtures) {
    const test = skip ? it.skip : it;

    test(`${dir}`, async () => {
      const scribeInput = fs.readFileSync(inputPath, 'utf-8');

      const html = convert(scribeInput);
      expect(html.length).toBeGreaterThan(0);
      if (OUTPUT_HTML)
        fs.writeFileSync(path.join(HERE, dir, 'output.html'), html);
    });
  }
});
