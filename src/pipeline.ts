import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkPf2e from "./parser/remark-pf2e.js";
import remarkActionSymbols from "./parser/remark-action-symbols.js";
import { wrapHtml } from "./renderer/html-template.js";
import type { DocumentMeta } from "./ir/types.js";

interface ConvertOptions {
  devScript?: string;
}

function extractFrontmatter(markdown: string): {
  meta: DocumentMeta;
  body: string;
} {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { meta: {}, body: markdown };
  }

  const meta: DocumentMeta = {};
  const fmLines = fmMatch[1]!.split("\n");
  for (const line of fmLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key === "title") meta.title = value;
    if (key === "watermark") meta.watermark = value;
    if (key === "page-numbers") meta.pageNumbers = value === "true";
  }

  return { meta, body: fmMatch[2]! };
}

export async function convertMarkdown(
  markdown: string,
  opts?: ConvertOptions,
): Promise<string> {
  const { meta, body } = extractFrontmatter(markdown);

  const processor = unified()
    .use(remarkParse)
    .use(remarkPf2e)
    .use(remarkActionSymbols)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const result = await processor.process(body);
  const content = String(result);

  return wrapHtml(content, meta, { devScript: opts?.devScript });
}
