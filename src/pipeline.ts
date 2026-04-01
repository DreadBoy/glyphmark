import { parseScribe } from "./parser/scribe-parser.js";
import { renderScribeDocument } from "./renderer/scribe-renderer.js";

interface ConvertOptions {
  devScript?: string;
}

export function convert(
  input: string,
  opts?: ConvertOptions,
): string {
  const doc = parseScribe(input);
  return renderScribeDocument(doc, { devScript: opts?.devScript });
}
