import { parseGlyph } from './parser';
import { renderGlyphDocument } from './renderer/render';

export function convert(input: string): string {
  return renderGlyphDocument(parseGlyph(input));
}
