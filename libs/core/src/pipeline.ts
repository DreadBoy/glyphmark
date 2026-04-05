import { parseScribe } from "./parser/scribe-parser.js";
import { renderScribeDocument } from "./renderer/scribe-renderer.js";

export function convert(input: string): string {
  const doc = parseScribe(input);
  return renderScribeDocument(doc);
}
