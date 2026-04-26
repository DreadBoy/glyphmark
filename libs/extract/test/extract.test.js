import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

import { extractPage } from '../src/extract.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const SOURCE = resolve(
  here,
  '../../books/Pathfinder 2e - Player Core (Remaster).pdf',
);
const CLI = resolve(here, '../src/extract.js');
const PAGE = 122;

test('extractPage returns a single-page PDF matching the source page', async () => {
  const bytes = await extractPage(SOURCE, PAGE);
  assert.ok(bytes instanceof Uint8Array && bytes.length > 0);

  const out = await PDFDocument.load(bytes);
  assert.equal(out.getPageCount(), 1);

  const source = await PDFDocument.load(await readFile(SOURCE));
  const srcPage = source.getPage(PAGE - 1);
  const outPage = out.getPage(0);
  assert.deepEqual(
    [outPage.getWidth(), outPage.getHeight()],
    [srcPage.getWidth(), srcPage.getHeight()],
  );
});

test('extractPage rejects out-of-range pages', async () => {
  const source = await PDFDocument.load(await readFile(SOURCE));
  const tooBig = source.getPageCount() + 1;
  await assert.rejects(() => extractPage(SOURCE, tooBig), /out of range/);
});

test('extractPage rejects invalid page numbers', async () => {
  await assert.rejects(() => extractPage(SOURCE, 0), /positive/);
  await assert.rejects(() => extractPage(SOURCE, 1.5), /positive/);
});

test('CLI writes a PDF file with --out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'extract-cli-'));
  try {
    const outPath = join(dir, 'page.pdf');
    const res = spawnSync(
      'node',
      [CLI, '--source', SOURCE, '--page', String(PAGE), '--out', outPath],
      { encoding: 'utf8' },
    );
    assert.equal(res.status, 0, `exit 0 (stderr: ${res.stderr})`);
    assert.equal(res.stdout.trim(), outPath);
    const s = await stat(outPath);
    assert.ok(s.size > 0);
    const out = await PDFDocument.load(await readFile(outPath));
    assert.equal(out.getPageCount(), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI exits non-zero on missing required args', () => {
  const res = spawnSync('node', [CLI, '--source', SOURCE], {
    encoding: 'utf8',
  });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /usage:/);
});

test('CLI rejects invalid page numbers via args', () => {
  const res = spawnSync(
    'node',
    [CLI, '--source', SOURCE, '--page', 'abc'],
    { encoding: 'utf8' },
  );
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /invalid page number/);
});
