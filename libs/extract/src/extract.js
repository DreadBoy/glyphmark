#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

export async function extractPage(sourcePath, page) {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('page must be a positive 1-based integer');
  }

  const source = await PDFDocument.load(await readFile(sourcePath));
  const total = source.getPageCount();
  if (page > total) {
    throw new Error(
      `page ${page} is out of range (source has ${total} pages, 1-indexed)`,
    );
  }

  const out = await PDFDocument.create();
  const [copied] = await out.copyPages(source, [page - 1]);
  out.addPage(copied);
  return out.save();
}

function usage() {
  console.error('usage: extract --source <pdf> --page <n> [--out <pdf>]');
  process.exit(2);
}

function parseArgs(argv) {
  const args = { source: null, page: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source' || a === '-s') args.source = argv[++i];
    else if (a === '--page' || a === '-p') args.page = argv[++i];
    else if (a === '--out' || a === '-o') args.out = argv[++i];
    else if (a === '--help' || a === '-h') usage();
    else {
      console.error(`unknown argument: ${a}`);
      usage();
    }
  }
  if (!args.source || args.page === null) usage();
  const n = Number(args.page);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`invalid page number: ${args.page}`);
    usage();
  }
  args.page = n;
  return args;
}

async function main() {
  const { source, page, out } = parseArgs(process.argv.slice(2));
  const sourcePath = resolve(source);
  const bytes = await extractPage(sourcePath, page);

  const outPath = out
    ? resolve(out)
    : join(
        dirname(sourcePath),
        `${basename(sourcePath, extname(sourcePath))}-p${page}.pdf`,
      );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, bytes);
  console.log(outPath);
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
