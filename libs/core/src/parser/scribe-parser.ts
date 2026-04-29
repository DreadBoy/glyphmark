/**
 * Scribe DSL parser.
 * Parses the Scribe DSL format into an intermediate representation.
 */

// ── IR Node Types ──────────────────────────────────────────────

export interface ScribeDocument {
  watermark?: string;
  title?: string;
  customCss?: string;
  contentRefs: Map<string, string>;
  fonts?: string[];
  pageNumbers: boolean;
  body: ScribeNode[];
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

export interface PageBreakNode {
  type: 'page-break';
}
export interface ColumnBreakNode {
  type: 'column-break';
}
export interface EndColumnsNode {
  type: 'end-columns';
}
export interface HorizontalRuleNode {
  type: 'hr';
}

export interface HeadBlockNode {
  type: 'head';
  content: string; // raw markdown content before the -
}

export interface InfoBlockNode {
  type: 'info';
  content: Segment[];
}

export type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'hr' }
  | { kind: 'column-break' };

export interface RulesBlockNode {
  type: 'rules';
  content: Segment[];
}

export interface NoteBlockNode {
  type: 'note';
  content: Segment[];
}

export interface MathBlockNode {
  type: 'math';
  content: string;
}

export interface ItemBlockNode {
  type: 'item';
  name: string;
  nameActions?: string; // e.g. ":a:"
  subtitle?: string;
  traits: string[];
  content: Segment[];
}

export interface LeftSidebarNode {
  type: 'left-sidebar';
  content: string;
}

export interface RightSidebarNode {
  type: 'right-sidebar';
  content: string;
}

export interface ParagraphNode {
  type: 'paragraph';
  content: string;
}

export interface HeadingNode {
  type: 'heading';
  level: number; // 1-6
  text: string;
}

export interface TableNode {
  type: 'table';
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
  caption?: string; // from ##### header before table
  footnotes: string[];
}

// ── Parser ─────────────────────────────────────────────────────

export function parseScribe(input: string): ScribeDocument {
  const doc: ScribeDocument = {
    contentRefs: new Map(),
    pageNumbers: false,
    body: [],
  };

  // ── Phase 1: Content reference extraction ──
  let content = input;

  // Split hidden section (everything after lone %)
  let hiddenSection = '';
  const hiddenMatch = content.match(/^%\s*$/m);
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
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  // Extract fonts() blocks
  const fontsMatches = content.matchAll(/fonts\s*\(\s*\n([\s\S]*?)\n\s*\)/g);
  const fontSpecs: string[] = [];
  for (const m of fontsMatches) {
    const specs = m[1]!
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    fontSpecs.push(...specs);
    content = content.replace(m[0], '');
  }
  if (fontSpecs.length > 0) {
    doc.fonts = fontSpecs;
  }

  // Extract pagenumbers keyword
  if (/^\s*pagenumbers\s*$/m.test(content)) {
    doc.pageNumbers = true;
    content = content.replace(/^\s*pagenumbers\s*$/gm, '');
  }

  // Strip sticky() blocks (unsupported)
  content = content.replace(/sticky\s*\([^)]*\)/g, '');

  // ── Phase 2: Extract watermark, title, css blocks ──

  // Extract watermark
  const wmMatch = content.match(/^watermark\s*\(\s*\n([\s\S]*?)\n\s*\)/m);
  if (wmMatch) {
    doc.watermark = wmMatch[1]!.trim();
    content = content.replace(wmMatch[0], '');
  }

  // Extract title
  const titleMatch = content.match(/^title\s*\(\s*\n([\s\S]*?)\n\s*\)/m);
  if (titleMatch) {
    doc.title = titleMatch[1]!.trim();
    content = content.replace(titleMatch[0], '');
  }

  // Extract css blocks
  const cssMatches = content.matchAll(/css\s*\(\s*\n([\s\S]*?)\n\s*\)/g);
  const cssParts: string[] = [];
  for (const m of cssMatches) {
    cssParts.push(m[1]!);
    content = content.replace(m[0], '');
  }
  if (cssParts.length > 0) {
    doc.customCss = cssParts.join('\n');
  }

  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // Page break (lone =, no leading whitespace)
    if (line === '=') {
      doc.body.push({ type: 'page-break' });
      i++;
      continue;
    }

    // Column break (lone |, no leading whitespace)
    if (line === '|') {
      doc.body.push({ type: 'column-break' });
      i++;
      continue;
    }

    // End columns (lone /, no leading whitespace)
    if (line === '/') {
      doc.body.push({ type: 'end-columns' });
      i++;
      continue;
    }

    // Horizontal rule (lone -, no leading whitespace)
    if (line === '-') {
      doc.body.push({ type: 'hr' });
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

      if (blockType === 'item') {
        doc.body.push(parseItemBlock(result.content));
      } else if (
        blockType === 'info' ||
        blockType === 'note' ||
        blockType === 'rules'
      ) {
        doc.body.push({
          type: blockType,
          content: parseSegments(result.content, `${blockType} block`),
        });
      } else if (blockType === 'left') {
        doc.body.push({ type: 'left-sidebar', content: result.content });
      } else if (blockType === 'right') {
        doc.body.push({ type: 'right-sidebar', content: result.content });
      } else {
        doc.body.push({
          type: blockType as 'head' | 'math',
          content: result.content,
        });
      }
      continue;
    }

    // Heading (# ## ### etc.)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!;

      doc.body.push({
        type: 'heading',
        level,
        text,
      });
      i++;
      continue;
    }

    // Table detection: line with | separators followed by --- line
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const nextTrimmed = lines[i + 1]!.trim();
      if (nextTrimmed.match(/^[\s\-:|]+$/) && nextTrimmed.includes('---')) {
        const tableResult = parseTable(lines, i, doc.body);
        doc.body.push(tableResult.node);
        i = tableResult.endIndex;
        continue;
      }
    }

    // List detection: lines starting with * or -  (note: lone - is hr, handled above)
    if (
      trimmed.startsWith('* ') ||
      (trimmed.startsWith('- ') && trimmed.length > 2)
    ) {
      const listItems: string[] = [];
      while (i < lines.length) {
        const listLine = lines[i]!.trim();
        if (listLine.startsWith('* ')) {
          listItems.push(listLine.slice(2));
          i++;
        } else if (listLine.startsWith('- ') && listLine.length > 2) {
          listItems.push(listLine.slice(2));
          i++;
        } else if (listLine === '') {
          i++;
          break;
        } else {
          break;
        }
      }
      // Emit as a paragraph with list content for now
      // (renderBlockContent handles * items)
      const listContent = listItems.map((item) => `* ${item}`).join('\n');
      doc.body.push({
        type: 'paragraph',
        content: listContent,
      });
      continue;
    }

    const paragraphLines: string[] = [line];
    i++;

    // Collect continuation lines (non-empty, not a special marker)
    while (i < lines.length) {
      const nextLine = lines[i]!;
      const nextTrimmed = nextLine.trim();
      if (
        nextTrimmed === '' ||
        nextLine === '=' ||
        nextLine === '|' ||
        nextLine === '/' ||
        nextLine === '-' ||
        nextTrimmed.startsWith('* ') ||
        nextTrimmed.match(
          /^(head|info|rules|note|math|item|left|right|css|watermark|title)\s*\(/,
        ) ||
        nextTrimmed.match(/^#{1,6}\s+/)
      ) {
        break;
      }
      // Check if next line starts a table
      if (nextTrimmed.includes('|') && i + 1 < lines.length) {
        const afterNext = lines[i + 1]?.trim() ?? '';
        if (afterNext.match(/^[\s\-:|]+$/) && afterNext.includes('---')) {
          break;
        }
      }
      paragraphLines.push(nextLine);
      i++;
    }

    doc.body.push({
      type: 'paragraph',
      content: paragraphLines.join('\n'),
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

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]!;

    for (const ch of line) {
      if (ch === '(') {
        if (!started) {
          started = true;
          depth = 1;
        } else {
          depth++;
        }
      } else if (ch === ')' && started) {
        depth--;
        if (depth === 0) {
          // Extract content: everything after first ( up to this )
          const fullBlock = lines.slice(startIndex, i + 1).join('\n');
          const openIdx = fullBlock.indexOf('(');
          const lastCloseIdx = fullBlock.lastIndexOf(')');
          const inner = fullBlock.slice(openIdx + 1, lastCloseIdx).trim();
          return { content: inner, endIndex: i };
        }
      }
    }
  }

  // No matching close found, return everything
  const fullBlock = lines.slice(startIndex).join('\n');
  const openIdx = fullBlock.indexOf('(');
  const inner = openIdx >= 0 ? fullBlock.slice(openIdx + 1).trim() : fullBlock;
  return { content: inner, endIndex: lines.length - 1 };
}

function parseItemBlock(content: string): ItemBlockNode {
  const lines = content.split('\n');
  let name = '';
  let nameActions: string | undefined;
  let subtitle: string | undefined;
  const traits: string[] = [];

  // Grammar:
  //   # Name [:a:]
  //   ## Subtitle?
  //   -
  //   ; trait1, trait2
  //   <content>
  //
  // Header runs until the first lone `-`. After that, `;` lines collect into
  // traits until a non-trait line appears; everything from there is content
  // (which may contain its own `-` HRs and `|` column-breaks).

  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (trimmed === '-') {
      i++;
      break;
    }
    if (trimmed === '') {
      i++;
      continue;
    }
    const nameMatch = trimmed.match(/^#\s+(.+)$/);
    if (nameMatch && !trimmed.startsWith('##')) {
      let nameText = nameMatch[1]!;
      const actionMatch = nameText.match(/\s+(:(?:aaa|aa|a|r|f):)\s*$/);
      if (actionMatch) {
        nameActions = actionMatch[1];
        nameText = nameText.replace(actionMatch[0], '').trim();
      }
      name = nameText;
      i++;
      continue;
    }
    const subMatch = trimmed.match(/^##\s+(.+)$/);
    if (subMatch) {
      subtitle = subMatch[1]!;
      i++;
      continue;
    }
    i++;
  }

  const contentLines: string[] = [];
  let inTraits = true;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (inTraits) {
      if (trimmed === '') {
        i++;
        continue;
      }
      if (trimmed.startsWith(';')) {
        const traitStr = trimmed.slice(1).trim();
        traits.push(
          ...traitStr
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        );
        i++;
        continue;
      }
      inTraits = false;
    }
    contentLines.push(line);
    i++;
  }

  const ctxLabel = `item${name ? ` "${name}"` : ''}`;
  return {
    type: 'item',
    name,
    nameActions,
    subtitle,
    traits,
    content: parseSegments(contentLines.join('\n'), ctxLabel),
  };
}

/**
 * Split raw block content into Segment[] on lone `-` (hr) and lone `|`
 * (column-break) lines. Strips leading/trailing hr/column-break with a
 * console.warn — they're invalid syntax (Phase 2 will turn this into a
 * proper parse error with line numbers).
 */
function parseSegments(raw: string, contextLabel: string): Segment[] {
  const lines = raw.split('\n');
  const segments: Segment[] = [];
  let buffer: string[] = [];

  const flushText = () => {
    if (buffer.length === 0) return;
    const raw = buffer.join('\n');
    buffer = [];
    // Blank line separates paragraphs — emit one text segment per paragraph.
    // Within a paragraph, soft line breaks collapse to a single space
    // (markdown-style: a single newline does not start a new line).
    for (const para of raw.split(/\n\s*\n/)) {
      const text = para.trim().replace(/\s*\n\s*/g, ' ');
      if (text !== '') {
        segments.push({ kind: 'text', content: text });
      }
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '-') {
      flushText();
      segments.push({ kind: 'hr' });
    } else if (trimmed === '|') {
      flushText();
      segments.push({ kind: 'column-break' });
    } else {
      buffer.push(line);
    }
  }
  flushText();

  while (segments.length > 0 && segments[0]!.kind !== 'text') {
    const dropped = segments.shift()!;
    console.warn(
      `[scribe] ${contextLabel}: leading ${dropped.kind} is invalid; content must start with text`,
    );
  }
  while (
    segments.length > 0 &&
    segments[segments.length - 1]!.kind !== 'text'
  ) {
    const dropped = segments.pop()!;
    console.warn(
      `[scribe] ${contextLabel}: trailing ${dropped.kind} is invalid`,
    );
  }

  return segments;
}

function parseTable(
  lines: string[],
  startIndex: number,
  bodyNodes: ScribeNode[],
): { node: TableNode; endIndex: number } {
  // Check if the previous node was a heading that serves as a caption
  let caption: string | undefined;
  const prevNode = bodyNodes[bodyNodes.length - 1];
  if (prevNode && prevNode.type === 'heading' && prevNode.level >= 4) {
    caption = prevNode.text;
    bodyNodes.pop(); // Remove heading — it becomes the table caption
  }

  const headerLine = lines[startIndex]!.trim();
  const separatorLine = lines[startIndex + 1]!.trim();

  const headers = headerLine
    .split('|')
    .map((h) => h.trim())
    .filter(Boolean);
  const aligns = separatorLine
    .split('|')
    .map((s) => {
      const t = s.trim();
      if (t.startsWith(':') && t.endsWith(':')) return 'center' as const;
      if (t.endsWith(':')) return 'right' as const;
      return 'left' as const;
    })
    .filter((_, idx) => idx < headers.length);

  const rows: string[][] = [];
  const footnotes: string[] = [];
  let i = startIndex + 2;

  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line === '' || !line.includes('|')) {
      // Check for table footnote: ". *" pattern
      if (line.startsWith('. *') || line.startsWith('.*')) {
        footnotes.push(line.replace(/^\.\s*\*\s*/, '').trim());
        i++;
        continue;
      }
      break;
    }
    rows.push(
      line
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean),
    );
    i++;
  }

  // Check for footnotes right after table
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line.startsWith('. *') || line.startsWith('.*')) {
      footnotes.push(line.replace(/^\.\s*\*\s*/, '').trim());
      i++;
    } else {
      break;
    }
  }

  return {
    node: {
      type: 'table',
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
function extractContentRefs(text: string, refs: Map<string, string>): void {
  // Match: identifier { content } where content can span multiple lines
  // and may contain nested braces
  const lines = text.split('\n');
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
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        if (depth > 0) {
          contentLines.push(l);
        } else {
          // Last line - include everything before the closing brace
          const lastBrace = l.lastIndexOf('}');
          if (lastBrace > 0) {
            contentLines.push(l.slice(0, lastBrace));
          }
        }
        i++;
      }

      refs.set(key, contentLines.join('\n').trim());
      continue;
    }
    i++;
  }
}

/**
 * Strip content reference definitions from text, leaving {{key}} placeholders intact.
 */
function stripContentRefDefinitions(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const match = line.match(/^(\w+)\s*\{\s*$/);
    if (match) {
      // Replace definition block with {{key}} so it renders inline
      const key = match[1]!;
      result.push(`{{${key}}}`);
      let depth = 1;
      i++;
      while (i < lines.length && depth > 0) {
        const l = lines[i]!;
        for (const ch of l) {
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
        }
        i++;
      }
      continue;
    }
    result.push(line);
    i++;
  }

  return result.join('\n');
}
