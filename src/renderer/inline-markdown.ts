/**
 * Renders inline markdown and action symbols to HTML.
 * Used by both the scribe block renderer and the main renderer.
 */

const ACTION_SVGS: Record<string, string> = {
  ":aaa:": `<span class="pf2e-action" title="Three Actions"><svg viewBox="0 0 36 12" width="54" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/><polygon points="27,6 30,1 33,6 30,11" fill="currentColor"/></svg></span>`,
  ":aa:": `<span class="pf2e-action" title="Two Actions"><svg viewBox="0 0 24 12" width="36" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/></svg></span>`,
  ":a:": `<span class="pf2e-action" title="Single Action"><svg viewBox="0 0 12 12" width="18" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/></svg></span>`,
  ":r:": `<span class="pf2e-action" title="Reaction"><svg viewBox="0 0 12 12" width="18" height="18"><path d="M9,6 L5,2 L5,5 L3,5 L3,7 L5,7 L5,10 Z" fill="currentColor"/></svg></span>`,
  ":f:": `<span class="pf2e-action" title="Free Action"><svg viewBox="0 0 12 12" width="18" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></span>`,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function replaceActionSymbols(text: string): string {
  return text.replace(/:aaa:|:aa:|:a:|:r:|:f:/g, (m) => ACTION_SVGS[m] ?? m);
}

/**
 * Renders inline markdown (bold, italic, links, images, action symbols)
 * from plain text to HTML. Does NOT handle block-level elements.
 */
export function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Images: ![alt](src)
  html = html.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" />',
  );

  // Links: [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>',
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
 * Handles paragraphs, lists, headings within block content.
 */
export function renderBlockContent(content: string): string {
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

    // Column break inside blocks
    if (trimmed === "|") {
      if (inList) { parts.push("</ul>"); inList = false; }
      parts.push('<div class="column-break"></div>');
      continue;
    }

    // Heading inside block
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) { parts.push("</ul>"); inList = false; }
      const level = headingMatch[1]!.length;
      let text = headingMatch[2]!;
      // Strip ToC labels from display
      text = text.replace(/\(\((\+*)(.*?)\)\)\s*$/, "").trim();
      parts.push(`<h${level}>${renderInlineMarkdown(text)}</h${level}>`);
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
    const indent = line.match(/^(\s+)/)?.[1]?.length ?? 0;
    const style = indent > 0 ? ` style="text-indent: ${indent * 0.5}em"` : "";
    parts.push(`<p${style}>${renderInlineMarkdown(trimmed)}</p>`);
  }

  if (inList) parts.push("</ul>");
  return parts.join("\n");
}
