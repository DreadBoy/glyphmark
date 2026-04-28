import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { convert } from '../../../src';

const here = path.resolve(import.meta.dirname, '.');
const OUTPUT_HTML = !!process.env.OUTPUT_HTML;

describe('page-4', () => {
  const file = fs.readFileSync(path.join(here, 'input.scribe'), 'utf-8');
  it('renders', () => {
    const html = convert(file);
    expect(html.length).toBeGreaterThan(0);
    if (OUTPUT_HTML) fs.writeFileSync(path.join(here, 'output.html'), html);
  });
});
