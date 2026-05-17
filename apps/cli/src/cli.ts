#!/usr/bin/env node

import fs from 'node:fs';
import { parseGlyph, renderToHtml, renderToPdf } from '@glyphmark/core';

const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error('Usage: glyphmark <input.glyph> <output.(html|pdf)>');
  process.exit(1);
}

const source = fs.readFileSync(input, 'utf-8');
const doc = parseGlyph(source);

if (output.endsWith('.html')) {
  fs.writeFileSync(output, renderToHtml(doc), 'utf-8');
} else if (output.endsWith('.pdf')) {
  fs.writeFileSync(output, await renderToPdf(doc));
} else {
  console.error(`Unsupported output extension: ${output}. Use .html or .pdf.`);
  process.exit(1);
}
