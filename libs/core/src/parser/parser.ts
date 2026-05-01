import type {
  ActionSymbol,
  BodyNode,
  Inline,
  ItemBlockNode,
  ListIndent,
  ParagraphIndent,
  ScribeDocument,
  Segment,
} from './ir';
import { parseInline } from './inline';
import { tokenize, type Token } from './lexer';

// Container kinds drive per-block indent decisions. "body" is the document
// level (normal text); the rest correspond to block-open keywords.
type ContainerKind =
  | 'body'
  | 'item'
  | 'rules'
  | 'sample'
  | 'info'
  | 'note'
  | 'head'
  | 'right';

function isBoldLead(content: Inline[]): boolean {
  return content[0]?.kind === 'strong';
}

function paragraphIndent(
  kind: ContainerKind,
  firstInSection: boolean,
  boldLead: boolean,
): ParagraphIndent {
  // item content uses a hanging indent for bold-leading "definition list"
  // paragraphs (e.g. **Critical Success** ...) and a first-line indent for
  // every paragraph after the first in a section.
  if (kind === 'item') {
    if (boldLead) return 'hanging';
    return firstInSection ? 'none' : 'first-line';
  }
  // body and rules use the standard prose rule: 1st flush, 2nd+ first-line.
  if (kind === 'body' || kind === 'rules') {
    return firstInSection ? 'none' : 'first-line';
  }
  // sample, info, note, head, right — paragraphs sit flush.
  return 'none';
}

function listIndent(kind: ContainerKind): ListIndent {
  // Lists hang in by one indent step in body and item containers; everywhere
  // else they sit flush with the column edge.
  if (kind === 'body' || kind === 'item') return 'block';
  return 'none';
}

export function parse(input: string): ScribeDocument {
  const tokens = tokenize(input);
  const doc: ScribeDocument = {
    pageNumbers: false,
    contentRefs: new Map(),
    body: [],
  };

  collectContentRefs(tokens, doc.contentRefs);

  const hiddenIdx = tokens.findIndex((t) => t.kind === 'hidden-delimiter');
  const visible = hiddenIdx === -1 ? tokens : tokens.slice(0, hiddenIdx);
  parseBody(visible, doc);

  return doc;
}

function parseBody(tokens: Token[], doc: ScribeDocument): void {
  let i = 0;
  // "First in section" means: this is the first paragraph since the start of
  // the body or since the last semantic reset (heading, full-width toggle, or
  // a container block). It controls whether we apply the first-line indent.
  let firstInSection = true;
  while (i < tokens.length) {
    const tok = tokens[i]!;

    switch (tok.kind) {
      case 'pagenumbers':
        doc.pageNumbers = true;
        i++;
        continue;

      case 'preamble':
        if (tok.type === 'watermark') doc.watermark = tok.content;
        else if (tok.type === 'css') {
          doc.customCss = doc.customCss
            ? `${doc.customCss}\n${tok.content}`
            : tok.content;
        } else if (tok.type === 'fonts') {
          const specs = tok.content
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
          doc.fonts = doc.fonts ? [...doc.fonts, ...specs] : specs;
        }
        i++;
        continue;

      case 'content-ref':
        // Already collected in pre-pass
        i++;
        continue;

      case 'blank':
        i++;
        continue;

      case 'page-break':
        doc.body.push({ type: 'page-break' });
        i++;
        continue;

      case 'column-break':
        doc.body.push({ type: 'column-break' });
        i++;
        continue;

      case 'full-width-toggle':
        doc.body.push({ type: 'full-width-toggle' });
        firstInSection = true;
        i++;
        continue;

      case 'heading':
        doc.body.push({
          type: 'heading',
          level: tok.level,
          content: parseInline(tok.text),
        });
        firstInSection = true;
        i++;
        continue;

      case 'centered-text':
        doc.body.push({
          type: 'centered-paragraph',
          content: parseInline(tok.content),
        });
        i++;
        continue;

      case 'list-item': {
        const items: Inline[][] = [];
        while (i < tokens.length) {
          const t = tokens[i]!;
          if (t.kind === 'list-item') {
            items.push(parseInline(t.text));
            i++;
          } else if (t.kind === 'blank') {
            // a blank still inside a list iff next is another list-item
            if (tokens[i + 1]?.kind === 'list-item') {
              i++;
            } else break;
          } else break;
        }
        doc.body.push({ type: 'list', items, indent: listIndent('body') });
        firstInSection = false;
        continue;
      }

      case 'table-header': {
        const node = consumeTable(tokens, i, doc.body);
        doc.body.push(node.table);
        i = node.next;
        continue;
      }

      case 'block-open': {
        if (tok.type === 'item') {
          doc.body.push(parseItem(tok.raw));
        } else if (tok.type === 'right') {
          doc.body.push({
            type: 'right-sidebar',
            content: parseSegments(tok.raw, 'right block', 'right'),
          });
        } else {
          doc.body.push({
            type: tok.type,
            content: parseSegments(tok.raw, `${tok.type} block`, tok.type),
          });
        }
        // A container block begins a new section on either side.
        firstInSection = true;
        i++;
        continue;
      }

      case 'text': {
        const lines: string[] = [tok.content];
        i++;
        while (i < tokens.length && tokens[i]!.kind === 'text') {
          lines.push((tokens[i] as { kind: 'text'; content: string }).content);
          i++;
        }
        const joined = lines.map((l) => l.trim()).join(' ');
        const content = parseInline(joined);
        doc.body.push({
          type: 'paragraph',
          content,
          indent: paragraphIndent('body', firstInSection, isBoldLead(content)),
        });
        firstInSection = false;
        continue;
      }

      // Tokens that don't belong at the body level — drop with a warning.
      case 'hr':
        console.warn('[scribe] top-level hr (lone -) is not valid; ignoring');
        i++;
        continue;
      case 'trait-line':
        console.warn(
          '[scribe] trait line (;) is only valid inside item(); ignoring',
        );
        i++;
        continue;
      case 'table-sep':
      case 'table-row':
      case 'table-footnote':
        // Should only appear after a table-header (handled above)
        i++;
        continue;
      case 'hidden-delimiter':
        // visible slice ends before this
        i++;
        continue;
    }
  }
}

function consumeTable(
  tokens: Token[],
  start: number,
  body: BodyNode[],
): { table: Extract<BodyNode, { type: 'table' }>; next: number } {
  const headerTok = tokens[start] as Extract<Token, { kind: 'table-header' }>;
  const sepTok =
    tokens[start + 1]?.kind === 'table-sep'
      ? (tokens[start + 1] as Extract<Token, { kind: 'table-sep' }>)
      : undefined;
  const rows: Inline[][][] = [];
  const footnotes: Inline[][] = [];

  let i = sepTok ? start + 2 : start + 1;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === 'table-row') {
      rows.push(t.cells.map((c) => parseInline(c)));
      i++;
    } else if (t.kind === 'table-footnote') {
      footnotes.push(parseInline(t.text));
      i++;
    } else {
      break;
    }
  }

  let caption: Inline[] | undefined;
  const prev = body[body.length - 1];
  if (prev && prev.type === 'heading' && prev.level >= 4) {
    caption = prev.content;
    body.pop();
  }

  return {
    table: {
      type: 'table',
      headers: headerTok.cells.map((c) => parseInline(c)),
      alignments: sepTok?.aligns ?? [],
      rows,
      caption,
      footnotes,
    },
    next: i,
  };
}

function parseItem(raw: string): ItemBlockNode {
  const tokens = tokenize(raw);
  let i = 0;
  let name: Inline[] = [];
  let action: ActionSymbol | undefined;
  let subtitle: Inline[] | undefined;
  const traits: string[] = [];

  while (i < tokens.length && tokens[i]!.kind === 'blank') i++;

  // Name (h1)
  if (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === 'heading' && t.level === 1) {
      let text = t.text;
      const m = text.match(/\s+(:(?:aaa|aa|a|r|f):)\s*$/);
      if (m) {
        action = m[1] as ActionSymbol;
        text = text.replace(m[0], '').trim();
      }
      name = parseInline(text);
      i++;
    }
  }

  while (i < tokens.length && tokens[i]!.kind === 'blank') i++;

  // Subtitle (h2)
  if (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === 'heading' && t.level === 2) {
      subtitle = parseInline(t.text);
      i++;
    }
  }

  while (i < tokens.length && tokens[i]!.kind === 'blank') i++;

  // Mandatory hr
  if (i < tokens.length && tokens[i]!.kind === 'hr') {
    i++;
  } else {
    console.warn('[scribe] item: missing hr separator after heading');
  }

  while (i < tokens.length && tokens[i]!.kind === 'blank') i++;

  // Optional traits (one or more `;` lines)
  while (i < tokens.length && tokens[i]!.kind === 'trait-line') {
    traits.push(
      ...(tokens[i] as { kind: 'trait-line'; traits: string[] }).traits,
    );
    i++;
  }

  const ctxLabel = `item${name.length ? ` "${inlineToString(name)}"` : ''}`;
  const content = parseSegmentsFromTokens(tokens.slice(i), ctxLabel, 'item');

  return {
    type: 'item',
    name,
    action,
    subtitle,
    traits,
    content,
  };
}

function parseSegments(
  raw: string,
  contextLabel: string,
  kind: ContainerKind,
): Segment[] {
  return parseSegmentsFromTokens(tokenize(raw), contextLabel, kind);
}

function parseSegmentsFromTokens(
  tokens: Token[],
  contextLabel: string,
  kind: ContainerKind,
): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  // Tracks paragraph position within the current section. A section is reset
  // by hr (segment-level divider) or heading.
  let firstInSection = true;

  while (i < tokens.length) {
    const tok = tokens[i]!;
    switch (tok.kind) {
      case 'blank':
        i++;
        continue;
      case 'hr':
        segments.push({ kind: 'hr' });
        firstInSection = true;
        i++;
        continue;
      case 'column-break':
        segments.push({ kind: 'column-break' });
        i++;
        continue;
      case 'heading':
        segments.push({
          kind: 'heading',
          level: tok.level,
          content: parseInline(tok.text),
        });
        firstInSection = true;
        i++;
        continue;
      case 'centered-text':
        segments.push({
          kind: 'centered-paragraph',
          content: parseInline(tok.content),
        });
        i++;
        continue;
      case 'list-item': {
        const items: Inline[][] = [];
        while (i < tokens.length) {
          const t = tokens[i]!;
          if (t.kind === 'list-item') {
            items.push(parseInline(t.text));
            i++;
          } else if (t.kind === 'blank') {
            if (tokens[i + 1]?.kind === 'list-item') i++;
            else break;
          } else break;
        }
        segments.push({ kind: 'list', items, indent: listIndent(kind) });
        firstInSection = false;
        continue;
      }
      case 'text': {
        const lines: string[] = [tok.content];
        i++;
        while (i < tokens.length && tokens[i]!.kind === 'text') {
          lines.push((tokens[i] as { kind: 'text'; content: string }).content);
          i++;
        }
        const joined = lines.map((l) => l.trim()).join(' ');
        const content = parseInline(joined);
        segments.push({
          kind: 'paragraph',
          content,
          indent: paragraphIndent(kind, firstInSection, isBoldLead(content)),
        });
        firstInSection = false;
        continue;
      }
      default:
        // Drop block-opens, content-refs, page/column break tokens that don't
        // belong inside a segment list. Content-refs are already collected.
        i++;
        continue;
    }
  }

  // Validation: leading/trailing hr or column-break is invalid.
  while (segments.length > 0) {
    const head = segments[0]!;
    if (head.kind === 'hr' || head.kind === 'column-break') {
      console.warn(
        `[scribe] ${contextLabel}: leading ${head.kind} is invalid; content must start with text`,
      );
      segments.shift();
    } else break;
  }
  while (segments.length > 0) {
    const tail = segments[segments.length - 1]!;
    if (tail.kind === 'hr' || tail.kind === 'column-break') {
      console.warn(
        `[scribe] ${contextLabel}: trailing ${tail.kind} is invalid`,
      );
      segments.pop();
    } else break;
  }

  return segments;
}

function collectContentRefs(tokens: Token[], refs: Map<string, string>): void {
  for (const t of tokens) {
    if (t.kind === 'content-ref') {
      refs.set(t.key, t.content);
    } else if (t.kind === 'block-open') {
      collectContentRefs(tokenize(t.raw), refs);
    }
  }
}

function inlineToString(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.kind === 'text') return n.text;
      return inlineToString(n.children);
    })
    .join('');
}
