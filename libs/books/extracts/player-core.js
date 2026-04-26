#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPage } from '../../extract/src/extract.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const SOURCE = resolve(here, '../Pathfinder 2e - Player Core (Remaster).pdf');
const PAGES = [110, 122, 125, 233, 272, 415];

const stem = basename(SOURCE, extname(SOURCE));
for (const page of PAGES) {
  const outPath = join(here, `${stem}-p${page}.pdf`);
  await writeFile(outPath, await extractPage(SOURCE, page));
  console.log(outPath);
}
