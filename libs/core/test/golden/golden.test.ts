import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convert } from '../../src/pipeline';

const HERE = path.resolve(import.meta.dirname, '.');
const OUTPUT_HTML = !!process.env.OUTPUT_HTML;

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
      if (OUTPUT_HTML)
        fs.writeFileSync(
          path.join(HERE, dir, 'output.html'),
          html.replace(
            '</head>',
            '<script type="text/javascript" src="https://livejs.com/live.js"></script></head>',
          ),
        );
    });
  }
});
