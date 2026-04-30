import { parseScribe } from './parser';
import { renderScribeDocument } from './renderer/render';

export function convert(input: string): string {
  return renderScribeDocument(parseScribe(input));
}
