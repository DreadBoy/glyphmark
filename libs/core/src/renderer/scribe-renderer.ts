/**
 * Scribe-compatible HTML renderer.
 * Renders a ScribeDocument into a complete HTML page.
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

// ── Main Renderer ─────────────────────────────────────────────

export function renderScribeDocument(
  doc: ScribeDocument,
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
  parts.push("</body>");
  parts.push("</html>");

  return parts.join("\n");
}

// ── Page Rendering ────────────────────────────────────────────

function renderPages(nodes: ScribeNode[], state: RenderState): string[] {
  const pages = nodes.reduce((chunks, node) => {
    if(node.type == "page-break")
      return [...chunks, []]
    else 
      return [...chunks.slice(0, chunks.length - 1), [...chunks[chunks.length - 1], node]];
  }, [[]] as ScribeNode[][]);

  return pages.map((pageNodes) => {
    const sections = pageNodes.reduce((chunks, node) => {
      if(node.type == "end-columns" || node.type == "head")
        return [...chunks, [node], []]
      else
        return [...chunks.slice(0, chunks.length - 1), [...chunks[chunks.length - 1], node]];
    }, [[]] as ScribeNode[][]);
    const currentPageContent = sections.map((fullWidthSection, idx) => {
      const columnBreak = fullWidthSection.findIndex((node) => node.type == "column-break");
      if (columnBreak >= 0) {
        const columns = fullWidthSection.reduce((chunks, node) => {
          if(node.type == "column-break")
            return [...chunks, []];
          else
            return [...chunks.slice(0, chunks.length - 1), [...chunks[chunks.length - 1], node]];
        }, [[]] as ScribeNode[][]);
        const wrapped = columns.map(column => `<div class="column">${column.map(renderNodeInner).join("")}</div>`).join("");
        return `<div class='columns'>${wrapped}</div>`;
      }
      // Standalone HR section (lone `-` between `/` markers) acts as a
      // visual section divider and needs more vertical breathing room
      // than an HR adjacent to paragraphs or inside head/item blocks.
      if (fullWidthSection.length === 1 && fullWidthSection[0]!.type === "hr") {
        return '<hr class="section-divider">';
      }
      const inner = fullWidthSection.map(renderNodeInner).join("");
      // Append .clear at the end of a sidebar section when the next section
      // doesn't already clear floats on its own (hr, columns). Without this,
      // the floated sidebar leaks into the following section and content
      // wraps around it instead of starting full-width below.
      const hasSidebar = fullWidthSection.some(
        (n) => n.type == "left-sidebar" || n.type == "right-sidebar",
      );
      if (!hasSidebar) return inner;
      const nextSection = sections.slice(idx + 1).find((s) =>
        s.some((n) => n.type != "end-columns"),
      );
      const nextStartsWithClearer =
        nextSection != null &&
        nextSection[0] != null &&
        (nextSection[0].type == "hr" || nextSection.some((n) => n.type == "column-break"));
      return nextStartsWithClearer ? inner : inner + '<div class="clear"></div>';
    });



    function renderNodeInner(node: ScribeNode) {
      if (node.type === "paragraph") {
        // Paragraphs might be content refs with block-level DSL
        const blockRef = expandAndRenderRef(node.content, state);
        if (blockRef !== null) {
          return blockRef;
        } else {
          const expanded = expandRefs(node.content, state.contentRefs);
          return renderBlockContent(expanded);
        }
      } else if (node.type === "heading" || node.type === "table" || node.type === "hr") {
        return renderInlineNode(node, state);
      } else if (node.type === "head") {
        return renderNode(node, state);
      } else {
        // Block-level nodes (info, rules, note, math, item, left, right)
        return renderNode(node, state);
      }
    }


    const parts: string[] = [];
    parts.push('<div class="page">');
    parts.push(currentPageContent.join(""));

    if (state.watermark) {
      parts.push(`<div class="watermark">${escapeHtml(state.watermark)}</div>`);
    }
    if (state.title) {
      parts.push(`<div class="title"><h1>${escapeHtml(state.title)}</h1></div>`);
    }

    parts.push('<div class="page-overlay"></div>');
    parts.push("</div>"); // .page
    return parts.join("");
  });
}

/**
 * Render inline nodes (headings, paragraphs, tables, hrs) that go inside
 * a shared <div class="content"> wrapper. Returns raw HTML without wrapper.
 */
function renderInlineNode(node: ScribeNode, state: RenderState): string {
  switch (node.type) {
    case "hr":
      return "<hr>";

    case "heading": {
      let text = expandRefs(node.text, state.contentRefs);
      let tocAnchors = "";

      if (node.tocLabel) {
        const id = node.tocLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        tocAnchors = ` <a id="toc-${id}"></a><a id="toc-${id}-${state.tocCounter}"></a>`;
        state.tocCounter++;
      }

      // H2 ordinal suffix splitting
      if (node.level === 2) {
        const ordinalMatch = text.match(/^(.+?)\s+(\d+(?:st|nd|rd|th))\s*$/i);
        if (ordinalMatch) {
          return `<div class="ordinal"><h2>${renderInlineMarkdown(ordinalMatch[1]!)}</h2><h2>${ordinalMatch[2]!}</h2></div>`;
        }
      }

      return `<h${node.level}>${renderInlineMarkdown(text)}${tocAnchors}</h${node.level}>`;
    }

    case "paragraph": {
      // Check if this is a standalone content ref with block DSL
      // If so, we need to close the content div, render the block, and reopen
      // (this is handled in renderPages, not here)
      const expanded = expandRefs(node.content, state.contentRefs);
      return renderBlockContent(expanded);
    }

    case "table":
      return renderTable(node);

    default:
      return "";
  }
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

    case "paragraph": {
      // Check for block-level content ref expansion
      const blockRef = expandAndRenderRef(node.content, state);
      if (blockRef !== null) return blockRef;
      // Inline paragraphs are handled by renderInlineNode
      const expanded = expandRefs(node.content, state.contentRefs);
      return `<div class="content">${renderBlockContent(expanded)}</div>`;
    }

    case "heading": {
      // Fallback: headings are normally handled by renderInlineNode in renderPages
      let text = expandRefs(node.text, state.contentRefs);
      let tocAnchors = "";
      if (node.tocLabel) {
        const id = node.tocLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        tocAnchors = ` <a id="toc-${id}"></a><a id="toc-${id}-${state.tocCounter}"></a>`;
        state.tocCounter++;
      }
      return `<h${node.level}>${renderInlineMarkdown(text)}${tocAnchors}</h${node.level}>`;
    }

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

  return `<div class="${cssClass}">${inner}</div>`;
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

  // Traits — sort: rarity, alignment, size, then source order
  if (item.traits.length > 0) {
    const categoryOrder = (t: string): number => {
      const cls = getTraitClass(t);
      if (cls === " pf-trait-uncommon" || cls === " pf-trait-rare" || cls === " pf-trait-unique") return 0;
      if (cls === " pf-trait-align") return 1;
      if (cls === " pf-trait-size") return 2;
      return 3;
    };
    const sortedTraits = item.traits
      .map((t, i) => ({ t, i, c: categoryOrder(t) }))
      .sort((a, b) => a.c - b.c || a.i - b.i)
      .map((x) => x.t);
    const traitDivs = sortedTraits.map((t) => {
      const traitClass = getTraitClass(t);
      return `<div class="pf-trait${traitClass}">${escapeHtml(t)}</div><!---->`;
    });
    parts.push('<div class="traits">' +
      '<div class="pf-trait pf-trait-edge">&nbsp;</div><!---->' +
      traitDivs.join("") +
      '<div class="pf-trait pf-trait-edge">&nbsp;</div>' +
      '</div>');
  }

  // Top section
  if (item.topSection) {
    const expanded = expandRefs(item.topSection, state.contentRefs);
    parts.push(renderBlockContent(expanded));
  }

  // Second separator (after top section or traits, before body)
  if (item.body) {
    if (item.topSection || item.traits.length > 0) {
      parts.push("<hr>");
    }
    const expanded = expandRefs(item.body, state.contentRefs);
    parts.push(renderBlockContent(expanded));
  }

  return `<div class="item">${parts.join("\n")}</div>`;
}

// renderParagraph and renderHeading are now handled inline by renderPages/renderInlineNode

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
