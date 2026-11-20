import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parseGlyph } from '../src/parser';
import { renderToPdf } from '../src/renderer/render';

const SKIP = !!process.env.SKIP_SCREENSHOTS;

const WORDS =
  'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango'.split(
    ' ',
  );

// The repro from #33: 60 sections of 10 filler paragraphs.
function longDocument(paragraphs: number): string {
  const out: string[] = [];
  for (let i = 0; i < paragraphs; i++) {
    if (i % 10 === 0) out.push(`# Section ${i / 10 + 1}\n`);
    const words = Array.from({ length: 90 }, (_, k) => WORDS[(i + k) % 20]);
    out.push(`Paragraph ${i + 1}. ${words.join(' ')}\n`);
  }
  return out.join('\n');
}

/**
 * `renderToPdf` used to print as soon as paged.js produced its first page,
 * so long documents were cut off wherever pagination had got to, at a page
 * count that varied from run to run and machine to machine (#33: ~32 pages
 * on the reporter's machine, 64 on a faster one). 1000 paragraphs make 80
 * pages, past both cutoffs.
 */
describe.skipIf(SKIP)('renderToPdf', { timeout: 180_000 }, () => {
  it('waits for paged.js to lay out the whole document', async () => {
    const pdf = await renderToPdf(parseGlyph(longDocument(1000)));
    const pages = (await PDFDocument.load(pdf)).getPageCount();
    expect(pages).toBeGreaterThanOrEqual(75);
  });
});
