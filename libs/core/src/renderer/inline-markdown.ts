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
      return `<img src="${src}" class="action-img">`;
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
    '<a data-label="$2" href="#">$1</a>',
  );

  // Regular links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a rel="noopener noreferrer" href="$2">$1</a>',
  );

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic: *text* or _text_
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/(^|[^\w])_(?!_)([^_]+?)_(?!\w)/g, "$1<em>$2</em>");

  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Action symbols
  html = replaceActionSymbols(html);

  return html;
}

/**
 * Renders a block of scribe content that may contain markdown.
 * Handles paragraphs, headings, lists within block content.
 * Returns scribe-compatible HTML with proper classes.
 */
type BlockItem = { type: "html"; html: string } | { type: "column-break" };

export function renderBlockContent(content: string, options?: {
  /** Counter state for TOC anchors - mutated in place */
  tocState?: { counter: number; toc: Array<{ label: string; id: string; indent: number }> };
}): string {
  const lines = content.split("\n");
  const items: BlockItem[] = [];
  let inList = false;

  function pushHtml(html: string): void {
    items.push({ type: "html", html });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const isListItem = trimmed.startsWith("* ") || trimmed.startsWith("- ");

    // Any non-list-item line ends an open list.
    if (inList && !isListItem) {
      pushHtml("</ul>");
      inList = false;
    }

    if (trimmed === "") continue;

    // Horizontal rule inside blocks (lone -, no leading whitespace)
    if (line === "-") {
      pushHtml("<hr>");
      continue;
    }

    // Column break inside blocks (lone |, no leading whitespace)
    if (line === "|") {
      items.push({ type: "column-break" });
      continue;
    }

    // Heading inside block
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
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

      pushHtml(`<h${level}>${renderInlineMarkdown(text)}${tocAnchors}</h${level}>`);
      continue;
    }

    // List item
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      if (!inList) {
        pushHtml("<ul>");
        inList = true;
      }
      pushHtml(`<li>${renderInlineMarkdown(trimmed.slice(2))}</li>`);
      continue;
    }

    // Regular paragraph

    // Hanging indent: paragraphs starting with **bold** get class="hang"
    const isHang = trimmed.startsWith("**") && trimmed.includes("**", 2);
    const hangAttr = isHang ? ' class="hang"' : "";

    // Leading space indent: convert to &nbsp;
    const leadingSpaces = line.match(/^(\s+)/)?.[1]?.length ?? 0;
    const last = items[items.length - 1];
    if (leadingSpaces > 0 && last && last.type === "html" && last.html.startsWith("<p")) {
      // Continuation line with indent - append as <br> to previous paragraph
      const nbsp = "&nbsp;".repeat(Math.min(leadingSpaces, 8));
      last.html = last.html.replace(
        /<\/p>$/,
        `<br>\n${nbsp}${renderInlineMarkdown(trimmed)}</p>`,
      );
      continue;
    }

    pushHtml(`<p${hangAttr}>${renderInlineMarkdown(trimmed)}</p>`);
  }

  if (inList) pushHtml("</ul>");

  // No column breaks: simple concatenation.
  if (!items.some((i) => i.type === "column-break")) {
    return items.map((i) => (i as { type: "html"; html: string }).html).join("\n");
  }

  // Column breaks present: chunk into columns and wrap, mirroring renderPages.
  const columns = items.reduce((cols, item) => {
    if (item.type === "column-break") return [...cols, []];
    return [...cols.slice(0, cols.length - 1), [...cols[cols.length - 1]!, item.html]];
  }, [[]] as string[][]);
  const wrapped = columns
    .map((col) => `<div class="column">${col.join("\n")}</div>`)
    .join("");
  return `<div class="columns">${wrapped}</div>`;
}
