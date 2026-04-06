/**
 * Renders inline markdown and action symbols to HTML.
 * Outputs scribe-compatible HTML classes for visual parity.
 */

import { ACTION_SYMBOLS } from "../vendor/action-symbols.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceActionSymbols(text: string): string {
  return text.replace(/:aaa:|:aa:|:a:|:r:|:f:/g, (m) => {
    const src = ACTION_SYMBOLS[m];
    if (src) {
      return `<img src="${src}" class="text-img">`;
    }
    return m;
  });
}

/**
 * Renders inline markdown (bold, italic, links, images, action symbols).
 * Does NOT handle block-level elements.
 */
export function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Images: ![alt](src)
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img alt="$1" src="$2">',
  );

  // Label links: [text](#label) → scribe-style anchor
  html = html.replace(
    /\[([^\]]+)\]\(#([^)]+)\)/g,
    '<a data-label="$2" href="#" class="pointer">$1</a>',
  );

  // Regular links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a rel="noopener noreferrer" href="$2">$1</a>',
  );

  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Action symbols
  html = replaceActionSymbols(html);

  return html;
}

/**
 * Renders a block of scribe content that may contain markdown.
 * Handles paragraphs, headings, lists within block content.
 * Returns scribe-compatible HTML with proper classes.
 */
export function renderBlockContent(content: string, options?: {
  /** Counter state for TOC anchors - mutated in place */
  tocState?: { counter: number; toc: Array<{ label: string; id: string; indent: number }> };
}): string {
  const lines = content.split("\n");
  const parts: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === "") {
      if (inList) {
        parts.push("</ul>");
        inList = false;
      }
      continue;
    }

    // Horizontal rule inside blocks (lone -)
    if (trimmed === "-") {
      if (inList) { parts.push("</ul>"); inList = false; }
      parts.push("<hr>");
      continue;
    }

    // Column break inside blocks
    if (trimmed === "|") {
      if (inList) { parts.push("</ul>"); inList = false; }
      // Close current inner column, start new one (inside the same block wrapper)
      parts.push('</div><div class="flex-even column">');
      continue;
    }

    // Heading inside block
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { parts.push("</ul>"); inList = false; }
      const level = headingMatch[1]!.length;
      let text = headingMatch[2]!;

      // Extract ToC label
      let tocAnchors = "";
      const tocMatch = text.match(/\(\((\+*)(.*?)\)\)\s*$/);
      if (tocMatch && options?.tocState) {
        const indent = tocMatch[1]!.length;
        const label = tocMatch[2]!;
        text = text.replace(tocMatch[0], "").trim();
        const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        tocAnchors = ` <a id="toc-${id}"></a><a id="toc-${id}-${options.tocState.counter}"></a>`;
        options.tocState.toc.push({ label, id, indent });
        options.tocState.counter++;
      } else {
        // Strip label without tracking
        text = text.replace(/\(\((\+*)(.*?)\)\)\s*$/, "").trim();
      }

      parts.push(`<h${level}>${renderInlineMarkdown(text)}${tocAnchors}</h${level}>`);
      continue;
    }

    // List item
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      if (!inList) {
        parts.push("<ul>");
        inList = true;
      }
      parts.push(`<li>${renderInlineMarkdown(trimmed.slice(2))}</li>`);
      continue;
    }

    // Regular paragraph
    if (inList) { parts.push("</ul>"); inList = false; }

    // Leading space indent: convert to &nbsp;
    const leadingSpaces = line.match(/^(\s+)/)?.[1]?.length ?? 0;
    if (leadingSpaces > 0 && parts.length > 0) {
      // Continuation line with indent - append as <br> to previous paragraph
      const nbsp = "&nbsp;".repeat(Math.min(leadingSpaces, 8));
      const lastPart = parts[parts.length - 1]!;
      if (lastPart.startsWith("<p")) {
        // Remove closing </p>, add <br> + indented line, re-close
        parts[parts.length - 1] = lastPart.replace(
          /<\/p>$/,
          `<br>\n${nbsp}${renderInlineMarkdown(trimmed)}</p>`,
        );
        continue;
      }
    }

    parts.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  if (inList) parts.push("</ul>");
  return parts.join("\n");
}
