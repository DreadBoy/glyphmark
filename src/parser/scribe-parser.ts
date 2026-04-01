/**
 * Scribe DSL parser.
 * Parses the scribe.pf2.tools format into an intermediate representation.
 */

import { renderInlineMarkdown } from "../renderer/inline-markdown.js";

// ── IR Node Types ──────────────────────────────────────────────

export interface ScribeDocument {
  watermark?: string;
  title?: string;
  customCss?: string;
  contentRefs: Map<string, string>;
  fonts?: string[];
  pageNumbers: boolean;
  toc: TocEntry[];
  body: ScribeNode[];
}

export interface TocEntry {
  label: string;
  id: string;
  indent: number; // 0, 1, 2 based on + count
}

export type ScribeNode =
  | PageBreakNode
  | ColumnBreakNode
  | EndColumnsNode
  | HorizontalRuleNode
  | HeadBlockNode
  | InfoBlockNode
  | RulesBlockNode
  | NoteBlockNode
  | MathBlockNode
  | ItemBlockNode
  | LeftSidebarNode
  | RightSidebarNode
  | ParagraphNode
  | HeadingNode
  | TableNode;

interface PageBreakNode { type: "page-break"; }
interface ColumnBreakNode { type: "column-break"; }
interface EndColumnsNode { type: "end-columns"; }
interface HorizontalRuleNode { type: "hr"; }

interface HeadBlockNode {
  type: "head";
  content: string; // raw markdown content before the -
}

interface InfoBlockNode {
  type: "info";
  content: string;
}

interface RulesBlockNode {
  type: "rules";
  content: string;
}

interface NoteBlockNode {
  type: "note";
  content: string;
}

interface MathBlockNode {
  type: "math";
  content: string;
}

interface ItemBlockNode {
  type: "item";
  name: string;
  nameActions?: string; // e.g. ":a:"
  subtitle?: string;
  traits: string[];
  topSection: string; // content between first - and second - (or ; line)
  body: string; // main content after second -
  tocLabel?: string;
  tocIndent?: number;
}

interface LeftSidebarNode {
  type: "left-sidebar";
  content: string;
}

interface RightSidebarNode {
  type: "right-sidebar";
  content: string;
}

interface ParagraphNode {
  type: "paragraph";
  content: string;
  indent?: number; // leading spaces count
}

interface HeadingNode {
  type: "heading";
  level: number; // 1-6
  text: string;
  tocLabel?: string;
  tocIndent?: number;
}

interface TableNode {
  type: "table";
  headers: string[];
  alignments: ("left" | "center" | "right")[];
  rows: string[][];
  caption?: string; // from ##### header before table
  footnotes: string[];
}

// ── Parser ─────────────────────────────────────────────────────

export function parseScribe(input: string): ScribeDocument {
  const doc: ScribeDocument = {
    contentRefs: new Map(),
    pageNumbers: false,
    toc: [],
    body: [],
  };

  // ── Phase 1: Content reference extraction ──
  let content = input;

  // Split hidden section (everything after lone %)
  let hiddenSection = "";
  const hiddenMatch = content.match(/^\s*%\s*$/m);
  if (hiddenMatch && hiddenMatch.index !== undefined) {
    hiddenSection = content.slice(hiddenMatch.index + hiddenMatch[0].length);
    content = content.slice(0, hiddenMatch.index);
  }

  // Extract content refs from HTML comments
  const htmlComments = content.matchAll(/<!--([\s\S]*?)-->/g);
  for (const cm of htmlComments) {
    extractContentRefs(cm[1]!, doc.contentRefs);
  }
  // Also check hidden section for HTML comments
  const hiddenComments = hiddenSection.matchAll(/<!--([\s\S]*?)-->/g);
  for (const cm of hiddenComments) {
    extractContentRefs(cm[1]!, doc.contentRefs);
  }

  // Extract content refs from body and hidden section
  extractContentRefs(content, doc.contentRefs);
  extractContentRefs(hiddenSection, doc.contentRefs);

  // Strip content ref definitions from body (but keep {{key}} for expansion during rendering)
  content = stripContentRefDefinitions(content);

  // Strip HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, "");

  // Extract fonts() blocks
  const fontsMatches = content.matchAll(/fonts\s*\(\s*\n([\s\S]*?)\n\s*\)/g);
  const fontSpecs: string[] = [];
  for (const m of fontsMatches) {
    const specs = m[1]!.split("\n").map(s => s.trim()).filter(Boolean);
    fontSpecs.push(...specs);
    content = content.replace(m[0], "");
  }
  if (fontSpecs.length > 0) {
    doc.fonts = fontSpecs;
  }

  // Extract pagenumbers keyword
  if (/^\s*pagenumbers\s*$/m.test(content)) {
    doc.pageNumbers = true;
    content = content.replace(/^\s*pagenumbers\s*$/gm, "");
  }

  // Strip sticky() blocks (unsupported)
  content = content.replace(/sticky\s*\([^)]*\)/g, "");

  // ── Phase 2: Extract watermark, title, css blocks ──

  // Extract watermark
  const wmMatch = content.match(/^watermark\s*\(\s*\n([\s\S]*?)\n\s*\)/m);
  if (wmMatch) {
    doc.watermark = wmMatch[1]!.trim();
    content = content.replace(wmMatch[0], "");
  }

  // Extract title
  const titleMatch = content.match(/^title\s*\(\s*\n([\s\S]*?)\n\s*\)/m);
  if (titleMatch) {
    doc.title = titleMatch[1]!.trim();
    content = content.replace(titleMatch[0], "");
  }

  // Extract css blocks
  const cssMatches = content.matchAll(/css\s*\(\s*\n([\s\S]*?)\n\s*\)/g);
  const cssParts: string[] = [];
  for (const m of cssMatches) {
    cssParts.push(m[1]!);
    content = content.replace(m[0], "");
  }
  if (cssParts.length > 0) {
    doc.customCss = cssParts.join("\n");
  }

  // Strip {{key}} placeholders from content (they'll be expanded during rendering)
  // We keep them as literal text for now; the renderer will expand them
  // Actually, we need to keep {{key}} in the content for the renderer to find and expand
  // No stripping needed here

  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === "") {
      i++;
      continue;
    }

    // Page break
    if (trimmed === "=") {
      doc.body.push({ type: "page-break" });
      i++;
      continue;
    }

    // Column break (lone |)
    if (trimmed === "|") {
      doc.body.push({ type: "column-break" });
      i++;
      continue;
    }

    // End columns (lone /)
    if (trimmed === "/") {
      doc.body.push({ type: "end-columns" });
      i++;
      continue;
    }

    // Horizontal rule (lone -)
    if (trimmed === "-") {
      doc.body.push({ type: "hr" });
      i++;
      continue;
    }

    // Block types: head, info, rules, note, math, item, left, right
    const blockMatch = trimmed.match(
      /^(head|info|rules|note|math|item|left|right)\s*\(/,
    );
    if (blockMatch) {
      const blockType = blockMatch[1]!;
      const result = extractBlock(lines, i);
      i = result.endIndex + 1;

      if (blockType === "item") {
        doc.body.push(parseItemBlock(result.content));
      } else if (blockType === "left") {
        doc.body.push({ type: "left-sidebar", content: result.content });
      } else if (blockType === "right") {
        doc.body.push({ type: "right-sidebar", content: result.content });
      } else {
        doc.body.push({
          type: blockType as "head" | "info" | "rules" | "note" | "math",
          content: result.content,
        });
      }
      continue;
    }

    // Heading (# ## ### etc.)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      let text = headingMatch[2]!;

      // Extract ToC label ((Label)) or ((+Label)) or ((++Label))
      let tocLabel: string | undefined;
      let tocIndent = 0;
      const tocMatch = text.match(/\(\((\+*)(.*?)\)\)\s*$/);
      if (tocMatch) {
        tocIndent = tocMatch[1]!.length;
        tocLabel = tocMatch[2]!;
        text = text.replace(tocMatch[0], "").trim();

        const id = tocLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        doc.toc.push({ label: tocLabel, id, indent: tocIndent });
      }

      doc.body.push({
        type: "heading",
        level,
        text,
        tocLabel,
        tocIndent,
      });
      i++;
      continue;
    }

    // Table detection: line with | separators followed by --- line
    if (trimmed.includes("|") && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1]!.trim();
      if (nextTrimmed.match(/^[\s\-:|]+$/) && nextTrimmed.includes("---")) {
        const tableResult = parseTable(lines, i, doc.body);
        doc.body.push(tableResult.node);
        i = tableResult.endIndex;
        continue;
      }
    }

    // List detection: lines starting with * or -  (note: lone - is hr, handled above)
    if (trimmed.startsWith("* ") || (trimmed.startsWith("- ") && trimmed.length > 2)) {
      const listItems: string[] = [];
      while (i < lines.length) {
        const listLine = lines[i]!.trim();
        if (listLine.startsWith("* ")) {
          listItems.push(listLine.slice(2));
          i++;
        } else if (listLine.startsWith("- ") && listLine.length > 2) {
          listItems.push(listLine.slice(2));
          i++;
        } else if (listLine === "") {
          i++;
          break;
        } else {
          break;
        }
      }
      // Emit as a paragraph with list content for now
      // (renderBlockContent handles * items)
      const listContent = listItems.map((item) => `* ${item}`).join("\n");
      doc.body.push({
        type: "paragraph",
        content: listContent,
      });
      continue;
    }

    // Regular paragraph (possibly with leading indent)
    const leadingSpaces = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    const paragraphLines: string[] = [trimmed];
    i++;

    // Collect continuation lines (non-empty, not a special marker)
    while (i < lines.length) {
      const nextLine = lines[i]!;
      const nextTrimmed = nextLine.trim();
      if (
        nextTrimmed === "" ||
        nextTrimmed === "=" ||
        nextTrimmed === "|" ||
        nextTrimmed === "/" ||
        nextTrimmed === "-" ||
        nextTrimmed.startsWith("* ") ||
        nextTrimmed.match(
          /^(head|info|rules|note|math|item|left|right|css|watermark|title)\s*\(/,
        ) ||
        nextTrimmed.match(/^#{1,6}\s+/)
      ) {
        break;
      }
      // Check if next line starts a table
      if (nextTrimmed.includes("|") && i + 1 < lines.length) {
        const afterNext = lines[i + 1]?.trim() ?? "";
        if (afterNext.match(/^[\s\-:|]+$/) && afterNext.includes("---")) {
          break;
        }
      }
      paragraphLines.push(nextTrimmed);
      i++;
    }

    doc.body.push({
      type: "paragraph",
      content: paragraphLines.join("\n"),
      indent: leadingSpaces > 0 ? leadingSpaces : undefined,
    });
  }

  return doc;
}

// ── Helpers ────────────────────────────────────────────────────

function extractBlock(
  lines: string[],
  startIndex: number,
): { content: string; endIndex: number } {
  // Find the opening ( and matching closing )
  // The block starts with "type (" or "type(" and ends with ")"
  let depth = 0;
  let started = false;
  const contentLines: string[] = [];
  let endIndex = startIndex;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!;

    for (const ch of line) {
      if (ch === "(") {
        if (!started) {
          started = true;
          depth = 1;
        } else {
          depth++;
        }
      } else if (ch === ")" && started) {
        depth--;
        if (depth === 0) {
          // Extract content: everything after first ( up to this )
          const fullBlock = lines.slice(startIndex, i + 1).join("\n");
          const openIdx = fullBlock.indexOf("(");
          const lastCloseIdx = fullBlock.lastIndexOf(")");
          const inner = fullBlock.slice(openIdx + 1, lastCloseIdx).trim();
          return { content: inner, endIndex: i };
        }
      }
    }

    endIndex = i;
  }

  // No matching close found, return everything
  const fullBlock = lines.slice(startIndex).join("\n");
  const openIdx = fullBlock.indexOf("(");
  const inner = openIdx >= 0 ? fullBlock.slice(openIdx + 1).trim() : fullBlock;
  return { content: inner, endIndex: lines.length - 1 };
}

function parseItemBlock(content: string): ItemBlockNode {
  const lines = content.split("\n");
  let name = "";
  let nameActions: string | undefined;
  let subtitle: string | undefined;
  let tocLabel: string | undefined;
  let tocIndent: number | undefined;
  const traits: string[] = [];
  let topSection = "";
  let body = "";

  // Parse the item structure:
  // # Name :a: ((+Label))
  // ## Subtitle
  // -
  // ; trait1,trait2
  // **Usage** text
  // -
  // Body text

  let phase: "header" | "top" | "body" = "header";
  let separatorCount = 0;
  const topLines: string[] = [];
  const bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (phase === "header") {
      // Parse name line
      const nameMatch = trimmed.match(/^#\s+(.+)$/);
      if (nameMatch && !trimmed.startsWith("##")) {
        let nameText = nameMatch[1]!;

        // Extract ToC label
        const tocMatch = nameText.match(/\(\((\+*)(.*?)\)\)\s*$/);
        if (tocMatch) {
          tocIndent = tocMatch[1]!.length;
          tocLabel = tocMatch[2]!;
          nameText = nameText.replace(tocMatch[0], "").trim();
        }

        // Extract action symbols from name
        const actionMatch = nameText.match(
          /\s+(:(?:aaa|aa|a|r|f):)\s*$/,
        );
        if (actionMatch) {
          nameActions = actionMatch[1];
          nameText = nameText.replace(actionMatch[0], "").trim();
        }

        name = nameText;
        continue;
      }

      // Parse subtitle line
      const subMatch = trimmed.match(/^##\s+(.+)$/);
      if (subMatch) {
        subtitle = subMatch[1]!;
        continue;
      }

      // First separator switches to top section
      if (trimmed === "-") {
        phase = "top";
        separatorCount++;
        continue;
      }
    }

    if (phase === "top") {
      // Trait line
      if (trimmed.startsWith(";")) {
        const traitStr = trimmed.slice(1).trim();
        traits.push(
          ...traitStr.split(",").map((t) => t.trim()).filter(Boolean),
        );
        continue;
      }

      // Second separator switches to body
      if (trimmed === "-") {
        phase = "body";
        separatorCount++;
        continue;
      }

      topLines.push(line);
      continue;
    }

    if (phase === "body") {
      bodyLines.push(line);
    }
  }

  // If we never hit a second separator, the top section IS the body
  if (separatorCount < 2) {
    body = topLines.join("\n").trim();
    topSection = "";
  } else {
    topSection = topLines.join("\n").trim();
    body = bodyLines.join("\n").trim();
  }

  return {
    type: "item",
    name,
    nameActions,
    subtitle,
    traits,
    topSection,
    body,
    tocLabel,
    tocIndent,
  };
}

function parseTable(
  lines: string[],
  startIndex: number,
  bodyNodes: ScribeNode[],
): { node: TableNode; endIndex: number } {
  // Check if the previous node was a heading that serves as a caption
  let caption: string | undefined;
  const prevNode = bodyNodes[bodyNodes.length - 1];
  if (prevNode && prevNode.type === "heading" && prevNode.level >= 4) {
    caption = prevNode.text;
  }

  const headerLine = lines[startIndex]!.trim();
  const separatorLine = lines[startIndex + 1]!.trim();

  const headers = headerLine.split("|").map((h) => h.trim()).filter(Boolean);
  const aligns = separatorLine.split("|").map((s) => {
    const t = s.trim();
    if (t.startsWith(":") && t.endsWith(":")) return "center" as const;
    if (t.endsWith(":")) return "right" as const;
    return "left" as const;
  }).filter((_, idx) => idx < headers.length);

  const rows: string[][] = [];
  const footnotes: string[] = [];
  let i = startIndex + 2;

  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line === "" || !line.includes("|")) {
      // Check for table footnote: ". *" pattern
      if (line.startsWith(". *") || line.startsWith(".*")) {
        footnotes.push(line.replace(/^\.\s*\*\s*/, "").trim());
        i++;
        continue;
      }
      break;
    }
    rows.push(line.split("|").map((c) => c.trim()).filter(Boolean));
    i++;
  }

  // Check for footnotes right after table
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line.startsWith(". *") || line.startsWith(".*")) {
      footnotes.push(line.replace(/^\.\s*\*\s*/, "").trim());
      i++;
    } else {
      break;
    }
  }

  return {
    node: {
      type: "table",
      headers,
      alignments: aligns,
      rows,
      caption,
      footnotes,
    },
    endIndex: i,
  };
}

// ── Content Reference Helpers ─────────────────────────────────

/**
 * Extract content reference definitions (key { ... }) from text.
 * Handles nested braces by depth tracking.
 */
function extractContentRefs(
  text: string,
  refs: Map<string, string>,
): void {
  // Match: identifier { content } where content can span multiple lines
  // and may contain nested braces
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const match = line.match(/^(\w+)\s*\{\s*$/);
    if (match) {
      const key = match[1]!;
      let depth = 1;
      const contentLines: string[] = [];
      i++;

      while (i < lines.length && depth > 0) {
        const l = lines[i]!;
        for (const ch of l) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        if (depth > 0) {
          contentLines.push(l);
        } else {
          // Last line - include everything before the closing brace
          const lastBrace = l.lastIndexOf("}");
          if (lastBrace > 0) {
            contentLines.push(l.slice(0, lastBrace));
          }
        }
        i++;
      }

      refs.set(key, contentLines.join("\n").trim());
      continue;
    }
    i++;
  }
}

/**
 * Strip content reference definitions from text, leaving {{key}} placeholders intact.
 */
function stripContentRefDefinitions(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const match = line.match(/^(\w+)\s*\{\s*$/);
    if (match) {
      // Skip the entire definition block
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        const l = lines[i]!;
        for (const ch of l) {
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        i++;
      }
      continue;
    }
    result.push(line);
    i++;
  }

  return result.join("\n");
}
