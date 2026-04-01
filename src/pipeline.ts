import { parseScribe } from "./parser/scribe-parser.js";
import { renderScribeDocument } from "./renderer/scribe-renderer.js";

interface ConvertOptions {
  devScript?: string;
}

export async function convertMarkdown(
  input: string,
  opts?: ConvertOptions,
): Promise<string> {
  const doc = parseScribe(input);
  return renderScribeDocument(doc, { devScript: opts?.devScript });
}
