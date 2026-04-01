/**
 * Scribe-compatible HTML renderer.
 * Outputs HTML with scribe.pf2.tools CSS class names for visual parity.
 */

import type { ScribeDocument, ScribeNode, TocEntry } from "../parser/scribe-parser.js";
import { renderInlineMarkdown, renderBlockContent } from "./inline-markdown.js";
import { getScribeCSS } from "./styles.js";
import { parseScribe } from "../parser/scribe-parser.js";

// ── Types ─────────────────────────────────────────────────────

interface RenderState {
  inColumns: boolean;
  watermark: string;
  title: string;
  tocCounter: number;
  toc: TocEntry[];
  contentRefs: Map<string, string>;
}

interface ConvertOptions {
  devScript?: string;
}

// ── Main Renderer ─────────────────────────────────────────────

export function renderScribeDocument(
  doc: ScribeDocument,
  opts?: ConvertOptions,
): string {
  const state: RenderState = {
    inColumns: false,
    watermark: doc.watermark ?? "",
    title: doc.title ?? "",
    tocCounter: 0,
    toc: doc.toc,
    contentRefs: doc.contentRefs,
  };

  const css = getScribeCSS({
    googleFonts: doc.fonts,
    pageNumbers: doc.pageNumbers,
    customCss: doc.customCss,
  });

  // Render body nodes into pages
  const pages = renderPages(doc.body, state);

  // Build full HTML document
  const parts: string[] = [];
  parts.push("<!DOCTYPE html>");
  parts.push('<html lang="en">');
  parts.push("<head>");
  parts.push('  <meta charset="UTF-8">');
  parts.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
  if (doc.title) {
    parts.push(`  <title>${escapeHtml(doc.title)}</title>`);
  }
  parts.push("</head>");
  parts.push("<body>");
  parts.push('<div id="result">');
  parts.push(`<style>${css}</style>`);

  for (const page of pages) {
    parts.push(page);
  }

  parts.push("</div>"); // #result

  if (opts?.devScript) {
    parts.push(opts.devScript);
  }

  parts.push("</body>");
  parts.push("</html>");

  return parts.join("\n");
}

// ── Page Rendering ────────────────────────────────────────────

function renderPages(nodes: ScribeNode[], state: RenderState): string[] {
  const pages: string[] = [];
  let currentPageContent: string[] = [];

  function flushPage(): void {
    const pageHtml = buildPage(currentPageContent.join("\n"), state);
    pages.push(pageHtml);
    currentPageContent = [];
  }

  // Start with a default column
  currentPageContent.push('<div data-markdown="1" class="flex-even column">');

  for (const node of nodes) {
    if (node.type === "page-break") {
      // Close current column
      currentPageContent.push("</div>"); // close column
      flushPage();
      // Start new page with fresh column
      currentPageContent.push('<div data-markdown="1" class="flex-even column">');
      continue;
    }

    if (node.type === "column-break") {
      // Close current column, start new one
      currentPageContent.push("</div>"); // close column
      currentPageContent.push('<div data-markdown="1" class="flex-even column">');
      continue;
    }

    if (node.type === "end-columns") {
      // Close current column, add row separator, start new column
      currentPageContent.push("</div>"); // close column
      currentPageContent.push('<div class="content w-100"></div>');
      currentPageContent.push('<div data-markdown="1" class="flex-even column">');
      continue;
    }

    // Render the node and add to current column
    const html = renderNode(node, state);
    if (html) {
      currentPageContent.push(html);
    }
  }

  // Close final column and flush last page
  currentPageContent.push("</div>"); // close column
  flushPage();

  return pages;
}

function buildPage(content: string, state: RenderState): string {
  const parts: string[] = [];
  parts.push("<div>");
  parts.push('<div data-markdown="1" class="bg-paper page d-flex flex-wrap">');
  parts.push('<div class="page-overlay"></div>');
  parts.push(content);

  if (state.watermark) {
    parts.push(`<div class="watermark">${escapeHtml(state.watermark)}</div>`);
  }
  if (state.title) {
    parts.push(`<div class="title"><h1>${escapeHtml(state.title)}</h1></div>`);
  }

  parts.push("</div>"); // .page
  parts.push("</div>");
  return parts.join("\n");
}

// ── Node Rendering ────────────────────────────────────────────

function renderNode(node: ScribeNode, state: RenderState): string {
  switch (node.type) {
    case "hr":
      return "<hr>";

    case "head":
    case "info":
    case "rules":
    case "note":
    case "math":
      return renderSimpleBlock(node.type, node.content, state);

    case "item":
      return renderItemBlock(node, state);

    case "left-sidebar":
      return renderSimpleBlock("left", node.content, state);

    case "right-sidebar":
      return renderSimpleBlock("right", node.content, state);

    case "paragraph":
      return renderParagraph(node, state);

    case "heading":
      return renderHeading(node, state);

    case "table":
      return renderTable(node);

    default:
      return "";
  }
}

function renderSimpleBlock(
  cssClass: string,
  content: string,
  state: RenderState,
): string {
  const expanded = expandRefs(content, state.contentRefs);
  const tocState = { counter: state.tocCounter, toc: state.toc };
  const inner = renderBlockContent(expanded, { tocState });
  state.tocCounter = tocState.counter;

  return `<div data-markdown="1" class="${cssClass} d-flex flex-wrap"><div data-markdown="1" class="flex-even column">${inner}</div></div>`;
}

function renderItemBlock(
  item: ScribeNode & { type: "item" },
  state: RenderState,
): string {
  const parts: string[] = [];

  // Name with action symbols and TOC anchor
  let nameHtml = renderInlineMarkdown(item.name);
  if (item.nameActions) {
    nameHtml += " " + renderInlineMarkdown(item.nameActions);
  }
  let tocAnchors = "";
  if (item.tocLabel) {
    const id = item.tocLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    tocAnchors = ` <a id="toc-${id}"></a><a id="toc-${id}-${state.tocCounter}"></a>`;
    state.toc.push({ label: item.tocLabel, id, indent: item.tocIndent ?? 0 });
    state.tocCounter++;
  }
  parts.push(`<h1>${nameHtml}${tocAnchors}</h1>`);

  // Subtitle
  if (item.subtitle) {
    parts.push(`<h2>${renderInlineMarkdown(item.subtitle)}</h2>`);
  }

  // First separator
  parts.push("<hr>");

  // Traits
  if (item.traits.length > 0) {
    const traitDivs = item.traits.map((t) => {
      const traitClass = getTraitClass(t);
      return `<div class="pf-trait${traitClass}">${escapeHtml(t)}</div><!---->`;
    });
    parts.push('<div class="traits">');
    parts.push('<div class="pf-trait pf-trait-edge">&nbsp;</div><!---->');
    parts.push(traitDivs.join(""));
    parts.push('<div class="pf-trait pf-trait-edge">&nbsp;</div>');
    parts.push("</div>");
  }

  // Top section
  if (item.topSection) {
    const expanded = expandRefs(item.topSection, state.contentRefs);
    parts.push(renderBlockContent(expanded));
  }

  // Second separator (if there's a body)
  if (item.body) {
    parts.push("<hr>");
    const expanded = expandRefs(item.body, state.contentRefs);
    parts.push(renderBlockContent(expanded));
  }

  return `<div data-markdown="1" class="item d-flex flex-wrap"><div data-markdown="1" class="flex-even column">${parts.join("\n")}</div></div>`;
}

function renderParagraph(
  node: ScribeNode & { type: "paragraph" },
  state: RenderState,
): string {
  // Check if this paragraph is a standalone content ref with block-level DSL
  const blockRef = expandAndRenderRef(node.content, state);
  if (blockRef !== null) return blockRef;

  const expanded = expandRefs(node.content, state.contentRefs);
  return `<div data-markdown="1" class="content">${renderBlockContent(expanded)}</div>`;
}

function renderHeading(
  node: ScribeNode & { type: "heading" },
  state: RenderState,
): string {
  let text = expandRefs(node.text, state.contentRefs);
  let tocAnchors = "";

  if (node.tocLabel) {
    const id = node.tocLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    tocAnchors = ` <a id="toc-${id}"></a><a id="toc-${id}-${state.tocCounter}"></a>`;
    state.tocCounter++;
  }

  // H2 ordinal suffix splitting: "More Text 4th" → flex container
  if (node.level === 2) {
    const ordinalMatch = text.match(/^(.+?)\s+(\d+(?:st|nd|rd|th))\s*$/i);
    if (ordinalMatch) {
      return `<div data-markdown="1" class="content"><div class="p d-flex"><h2>${renderInlineMarkdown(ordinalMatch[1]!)}</h2><h2 class="mr-0 my-0 ml-auto">${ordinalMatch[2]!}</h2></div></div>`;
    }
  }

  const heading = `<h${node.level}>${renderInlineMarkdown(text)}${tocAnchors}</h${node.level}>`;
  return `<div data-markdown="1" class="content">${heading}</div>`;
}

function renderTable(node: ScribeNode & { type: "table" }): string {
  const parts: string[] = [];

  // Caption (h5 before table)
  if (node.caption) {
    parts.push(`<h5>${renderInlineMarkdown(node.caption)}</h5>`);
  }

  parts.push("<table>");

  // Header
  parts.push("<thead><tr>");
  for (let j = 0; j < node.headers.length; j++) {
    const align = node.alignments[j];
    const style = align && align !== "left" ? ` style="text-align:${align};"` : "";
    parts.push(`<th${style}>${renderInlineMarkdown(node.headers[j]!)}</th>`);
  }
  parts.push("</tr></thead>");

  // Body rows
  parts.push("<tbody>");
  for (const row of node.rows) {
    parts.push("<tr>");
    for (let j = 0; j < row.length; j++) {
      const align = node.alignments[j];
      const style = align && align !== "left" ? ` style="text-align:${align};"` : "";
      parts.push(`<td${style}>${renderInlineMarkdown(row[j]!)}</td>`);
    }
    parts.push("</tr>");
  }
  parts.push("</tbody></table>");

  // Footnotes
  for (const fn of node.footnotes) {
    parts.push(`<div class="tfoot">* ${renderInlineMarkdown(fn)}</div>`);
  }

  return parts.join("\n");
}

// ── Trait Helpers ──────────────────────────────────────────────

function getTraitClass(trait: string): string {
  const t = trait.toLowerCase().trim();
  if (t === "uncommon") return " pf-trait-uncommon";
  if (t === "rare") return " pf-trait-rare";
  if (t === "unique") return " pf-trait-unique";
  const sizes = ["tiny", "small", "medium", "large", "huge", "gargantuan"];
  if (sizes.includes(t)) return " pf-trait-size";
  const aligns = ["lg", "ln", "le", "ng", "n", "ne", "cg", "cn", "ce",
    "lawful good", "lawful neutral", "lawful evil",
    "neutral good", "neutral", "neutral evil",
    "chaotic good", "chaotic neutral", "chaotic evil"];
  if (aligns.includes(t)) return " pf-trait-align";
  return ` pf-trait-${t.replace(/\s+/g, "-")}`;
}

// ── Content Reference Expansion ───────────────────────────────

/**
 * Expand {{key}} references in text. For simple inline text, returns the
 * expanded string. For content that contains scribe DSL blocks (item(), note(), etc.),
 * parses and renders them as full HTML.
 */
function expandRefs(
  text: string,
  refs: Map<string, string>,
  depth: number = 0,
): string {
  if (depth > 10) return text;
  if (!text.includes("{{")) return text;

  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const content = refs.get(key);
    if (content === undefined) {
      console.warn(`[glyphmark] Undefined content reference: {{${key}}}`);
      return match;
    }
    return expandRefs(content, refs, depth + 1);
  });
}

/**
 * Expand content references that contain scribe DSL blocks.
 * When a paragraph is just "{{key}}" and the ref contains block-level DSL,
 * parse and render the whole thing as scribe nodes.
 */
function expandAndRenderRef(
  content: string,
  state: RenderState,
): string | null {
  // Check if the content is a single {{key}} reference
  const refMatch = content.trim().match(/^\{\{(\w+)\}\}$/);
  if (!refMatch) return null;

  const key = refMatch[1]!;
  const refContent = state.contentRefs.get(key);
  if (refContent === undefined) {
    console.warn(`[glyphmark] Undefined content reference: {{${key}}}`);
    return null;
  }

  // Check if the ref contains block-level DSL (item(), note(), etc.)
  if (/^(head|info|rules|note|math|item|left|right)\s*\(/m.test(refContent)) {
    // Parse through full pipeline
    const refDoc = parseScribe(refContent);
    // Render each node
    const parts: string[] = [];
    for (const node of refDoc.body) {
      const html = renderNode(node, state);
      if (html) parts.push(html);
    }
    return parts.join("\n");
  }

  // Not block-level DSL, return null to use normal text expansion
  return null;
}

// ── Utilities ─────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
