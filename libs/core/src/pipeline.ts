import { parseScribe } from "./parser/scribe-parser.js";
import { renderScribeDocument } from "./renderer/render.jsx";

export function convert(input: string): string {
  return renderScribeDocument(parseScribe(input));
}
