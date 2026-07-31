import fs from 'node:fs';
import path from 'node:path';

export const GOLDEN_DIR = path.resolve(import.meta.dirname, '.');

/**
 * How a fixture participates in the suites.
 *
 * - `run`  — `input.glyph`, a regular test
 * - `skip` — `input.skip.glyph`, `it.skip`
 * - `todo` — `input.todo.glyph`, `it.todo`; the body is a note describing the
 *   block and the source book page, and is neither parsed nor rendered
 */
export type Mode = 'run' | 'skip' | 'todo';

export type Fixture = { dir: string; inputPath: string; mode: Mode };

/**
 * Discover fixture directories, one entry per subdirectory that carries a
 * marker file. Shared by the screenshot suite and the IR suite so the two can
 * never drift on which fixtures exist.
 */
export function discoverFixtures(): Fixture[] {
  return fs
    .readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d): Fixture[] => {
      const dir = d.name;
      const todoPath = path.join(GOLDEN_DIR, dir, 'input.todo.glyph');
      const skipPath = path.join(GOLDEN_DIR, dir, 'input.skip.glyph');
      const inputPath = path.join(GOLDEN_DIR, dir, 'input.glyph');
      if (fs.existsSync(todoPath))
        return [{ dir, inputPath: todoPath, mode: 'todo' }];
      if (fs.existsSync(skipPath))
        return [{ dir, inputPath: skipPath, mode: 'skip' }];
      if (fs.existsSync(inputPath)) return [{ dir, inputPath, mode: 'run' }];
      return [];
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}
