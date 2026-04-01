/**
 * Renders a ScribeDocument to HTML.
 */

import type { ScribeDocument, ScribeNode, TocEntry } from "../parser/scribe-parser.js";
import {
  renderInlineMarkdown,
  renderBlockContent,
} from "./inline-markdown.js";
import { PF2E_CSS } from "./styles.js";

export function renderScribeDocument(
  doc: ScribeDocument,
  opts?: { devScript?: string },
): string {
  const title = doc.title ?? "Glyphmark Document";
  const parts: string[] = [];

  // Build ToC if entries exist
  if (doc.toc.length > 0) {
    parts.push(renderToc(doc.toc));
  }

  // Render body nodes
  let inColumns = false;
  for (const node of doc.body) {
    if (node.type === "column-break") {
      if (!inColumns) {
        parts.push('<div class="columns">');
        parts.push('<div class="column">');
        inColumns = true;
      } else {
        parts.push("</div>"); // close previous column
        parts.push('<div class="column">');
      }
      continue;
    }

    if (node.type === "end-columns") {
      if (inColumns) {
        parts.push("</div>"); // close last column
        parts.push("</div>"); // close columns wrapper
        inColumns = false;
      }
      continue;
    }

    parts.push(renderNode(node));
  }

  // Close any open columns
  if (inColumns) {
    parts.push("</div></div>");
  }

  const bodyHtml = parts.join("\n");
  const watermarkHtml = doc.watermark
    ? `<div class="pf2e-watermark">${escapeHtml(doc.watermark)}</div>`
    : "";

  const customCss = doc.customCss ? `\n${doc.customCss}` : "";
  const devScript = opts?.devScript ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${PF2E_CSS}${SCRIBE_LAYOUT_CSS}${customCss}</style>
</head>
<body>
${watermarkHtml}
${bodyHtml}
${devScript}
</body>
</html>`;
}

function renderNode(node: ScribeNode): string {
  switch (node.type) {
    case "page-break":
      return '<div class="page-break"></div>';

    case "hr":
      return "<hr>";

    case "column-break":
    case "end-columns":
      return ""; // handled by the column tracking in renderScribeDocument

    case "head": {
      // Head blocks use - as bottom separator, strip it
      const headContent = node.content.replace(/\n-\s*$/, "").trim();
      return `<div class="scribe-head">${renderBlockContent(headContent)}</div>`;
    }

    case "info":
      return `<div class="scribe-info">${renderBlockContent(node.content)}</div>`;

    case "rules":
      return `<div class="scribe-rules">${renderBlockContent(node.content)}</div>`;

    case "note":
      return `<div class="scribe-note">${renderBlockContent(node.content)}</div>`;

    case "math":
      return `<div class="scribe-math">${renderInlineMarkdown(node.content)}</div>`;

    case "item":
      return renderItemBlock(node);

    case "left-sidebar":
      return `<div class="scribe-sidebar scribe-sidebar-left">${renderBlockContent(node.content)}</div>`;

    case "right-sidebar":
      return `<div class="scribe-sidebar scribe-sidebar-right">${renderBlockContent(node.content)}</div>`;

    case "paragraph": {
      // Check if content contains list items
      if (node.content.match(/^\* /m)) {
        return renderBlockContent(node.content);
      }
      const style = node.indent ? ` style="text-indent: ${node.indent * 0.5}em"` : "";
      return `<p${style}>${renderInlineMarkdown(node.content)}</p>`;
    }

    case "heading": {
      const id = node.tocLabel
        ? ` id="${node.tocLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}"`
        : "";
      const text = renderInlineMarkdown(node.text);
      return `<h${node.level}${id}>${text}</h${node.level}>`;
    }

    case "table":
      return renderTable(node);
  }
}

function renderItemBlock(item: ScribeNode & { type: "item" }): string {
  const parts: string[] = [];

  // Header
  const actions = item.nameActions
    ? ` ${renderInlineMarkdown(item.nameActions)}`
    : "";
  const id = item.tocLabel
    ? ` id="${item.tocLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}"`
    : "";

  parts.push(`<div class="pf2e-block pf2e-item"${id}>`);
  parts.push(`<header class="pf2e-header">`);
  parts.push(
    `<h3 class="pf2e-name">${escapeHtml(item.name)}${actions}</h3>`,
  );
  if (item.subtitle) {
    parts.push(
      `<span class="pf2e-level">${renderInlineMarkdown(item.subtitle)}</span>`,
    );
  }
  parts.push(`</header>`);

  // Traits
  if (item.traits.length > 0) {
    parts.push(`<div class="pf2e-traits">`);
    for (const trait of item.traits) {
      const rarity = getRarityClass(trait);
      parts.push(
        `<span class="pf2e-trait ${rarity}">${escapeHtml(trait)}</span>`,
      );
    }
    parts.push(`</div>`);
  }

  // Top section (between first and second -)
  if (item.topSection) {
    parts.push(`<div class="pf2e-separator"></div>`);
    parts.push(
      `<div class="pf2e-top-section">${renderBlockContent(item.topSection)}</div>`,
    );
  }

  // Body
  if (item.body) {
    parts.push(`<div class="pf2e-separator"></div>`);
    parts.push(
      `<div class="pf2e-description">${renderBlockContent(item.body)}</div>`,
    );
  }

  parts.push(`</div>`);
  return parts.join("\n");
}

function renderTable(table: ScribeNode & { type: "table" }): string {
  const parts: string[] = [];

  if (table.caption) {
    parts.push(
      `<div class="table-caption">${renderInlineMarkdown(table.caption)}</div>`,
    );
  }

  parts.push("<table>");
  parts.push("<thead><tr>");
  for (const h of table.headers) {
    parts.push(`<th>${renderInlineMarkdown(h)}</th>`);
  }
  parts.push("</tr></thead>");

  parts.push("<tbody>");
  for (const row of table.rows) {
    parts.push("<tr>");
    for (let i = 0; i < row.length; i++) {
      const align = table.alignments[i] ?? "left";
      const style = align !== "left" ? ` style="text-align: ${align}"` : "";
      parts.push(`<td${style}>${renderInlineMarkdown(row[i]!)}</td>`);
    }
    parts.push("</tr>");
  }
  parts.push("</tbody></table>");

  for (const fn of table.footnotes) {
    parts.push(
      `<div class="table-footnote">* ${renderInlineMarkdown(fn)}</div>`,
    );
  }

  return parts.join("\n");
}

function renderToc(entries: TocEntry[]): string {
  const items = entries
    .map(
      (e) =>
        `<li class="toc-indent-${e.indent}"><a href="#${e.id}">${escapeHtml(e.label)}</a></li>`,
    )
    .join("\n");
  return `<nav class="toc"><h2>Table of Contents</h2><ul>${items}</ul></nav>`;
}

function getRarityClass(trait: string): string {
  const lower = trait.toLowerCase();
  if (lower === "uncommon") return "rarity-uncommon";
  if (lower === "rare") return "rarity-rare";
  if (lower === "unique") return "rarity-unique";
  return "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Additional CSS for scribe layout features
const SCRIBE_LAYOUT_CSS = `

/* Columns */
.columns {
  display: flex;
  gap: 1.5em;
}
.column {
  flex: 1;
  min-width: 0;
}

/* Page break */
.page-break {
  page-break-after: always;
  border-top: 3px double var(--pf2e-separator);
  margin: 2em 0;
  padding-top: 2em;
}

@media print {
  .page-break {
    border: none;
    margin: 0;
    padding: 0;
  }
}

/* Head block */
.scribe-head {
  background: var(--pf2e-header-bg);
  color: var(--pf2e-header-text);
  padding: 0.8em 1.2em;
  margin: 1em 0;
}
.scribe-head h1, .scribe-head h2, .scribe-head h3,
.scribe-head h4, .scribe-head h5, .scribe-head h6 {
  color: var(--pf2e-header-text);
  margin-top: 0;
}
.scribe-head p {
  color: var(--pf2e-header-text);
}

/* Info block */
.scribe-info {
  background: var(--pf2e-header-bg);
  color: var(--pf2e-header-text);
  padding: 0.8em 1.2em;
  margin: 1em 0;
  border-radius: 4px;
}
.scribe-info h1, .scribe-info h2, .scribe-info h3 {
  color: var(--pf2e-header-text);
  margin-top: 0.3em;
}
.scribe-info p {
  color: var(--pf2e-header-text);
}

/* Rules block */
.scribe-rules {
  background: rgba(93, 0, 0, 0.08);
  border: 2px solid var(--pf2e-accent);
  padding: 0.8em 1.2em;
  margin: 1em 0;
}
.scribe-rules h1, .scribe-rules h2, .scribe-rules h3 {
  color: var(--pf2e-accent);
  margin-top: 0.3em;
}

/* Note block */
.scribe-note {
  background: rgba(212, 196, 160, 0.3);
  border: 1px solid var(--pf2e-separator);
  padding: 0.8em 1.2em;
  margin: 1em 0;
}
.scribe-note h1, .scribe-note h2 {
  color: var(--pf2e-accent);
  margin-top: 0.3em;
}

/* Math block */
.scribe-math {
  font-family: "Courier New", Courier, monospace;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--pf2e-separator);
  padding: 0.6em 1em;
  margin: 1em 0;
  text-align: center;
}

/* Sidebars */
.scribe-sidebar {
  background: rgba(93, 0, 0, 0.06);
  border: 1px solid var(--pf2e-separator);
  padding: 0.8em 1.2em;
  margin: 1em 0;
  float: left;
  width: 33%;
  margin-right: 1em;
}
.scribe-sidebar-right {
  float: right;
  margin-right: 0;
  margin-left: 1em;
}
.scribe-sidebar h1, .scribe-sidebar h2, .scribe-sidebar h3 {
  color: var(--pf2e-accent);
  margin-top: 0.3em;
  font-size: 1em;
}

/* Clear floats after sidebars */
.scribe-sidebar + * {
  overflow: hidden;
}

/* Table of Contents */
.toc {
  background: rgba(212, 196, 160, 0.2);
  border: 1px solid var(--pf2e-separator);
  padding: 0.8em 1.2em;
  margin: 1em 0;
}
.toc h2 {
  margin-top: 0;
  font-size: 1.2em;
}
.toc ul {
  list-style: none;
  padding: 0;
}
.toc li {
  padding: 0.15em 0;
}
.toc-indent-1 {
  padding-left: 1.2em !important;
}
.toc-indent-2 {
  padding-left: 2.4em !important;
}
.toc a {
  color: var(--pf2e-accent);
  text-decoration: none;
}
.toc a:hover {
  text-decoration: underline;
}

/* Table caption */
.table-caption {
  font-weight: bold;
  font-size: 0.9em;
  margin-bottom: 0.3em;
  color: var(--pf2e-accent);
}

/* Table footnote */
.table-footnote {
  font-size: 0.85em;
  font-style: italic;
  margin-top: 0.3em;
}

/* Column break inside blocks */
.column-break {
  break-before: column;
}

/* Item top section */
.pf2e-top-section p {
  margin: 0.2em 0;
}
`;
