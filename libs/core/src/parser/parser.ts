import type {
  ActionSymbol,
  BodyNode,
  CellInline,
  Inline,
  InfoSegment,
  ItemBlockNode,
  ItemSegment,
  ListIndent,
  ParagraphIndent,
  RulesSegment,
  SampleSegment,
  ScribeDocument,
  Segment,
  TableFootnote,
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

// Widest possible segment shape the parser can emit. Each caller narrows to
// its concrete container segment type via a (provably sound) cast — the
// parser only emits kinds that the container's allowed-set permits.
type AnySegment = ItemSegment | SampleSegment | RulesSegment | InfoSegment;
type SegmentKind = AnySegment['kind'];

// Single source of truth for "which segment kinds may appear in which
// container." Anything else is dropped with a warning at parse time. To
// tighten or loosen a container, edit only this table — the parser doesn't
// need per-kind branches. Exported so tests can drive a matrix of negative
// cases (warn-and-drop) directly off this table without restating it.
export const ALLOWED_SEGMENTS: Record<
  Exclude<ContainerKind, 'body'>,
  Set<SegmentKind>
> = {
  item: new Set(['paragraph', 'heading', 'list', 'column-break', 'hr']),
  sample: new Set(['paragraph', 'heading', 'centered-paragraph']),
  rules: new Set(['paragraph', 'heading', 'list', 'column-break']),
  info: new Set(['paragraph', 'heading', 'column-break']),
  note: new Set(['paragraph', 'heading']),
  head: new Set(['paragraph', 'heading']),
  right: new Set(['paragraph', 'heading']),
};

function tryPushSegment(
  segments: AnySegment[],
  seg: AnySegment,
  kind: Exclude<ContainerKind, 'body'>,
  contextLabel: string,
): boolean {
  if (ALLOWED_SEGMENTS[kind].has(seg.kind)) {
    segments.push(seg);
    return true;
  }
  console.warn(
    `[scribe] ${contextLabel}: ${seg.kind} is not valid inside ${kind}(); ignoring`,
  );
  return false;
}

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
  let fullWidthToggleIdx = 0;
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
        doc.body.push({
          type: 'full-width-toggle',
          index: ++fullWidthToggleIdx,
        });
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
        // Each branch casts the parser's wide `AnySegment[]` to the narrow
        // segment type the target node accepts. The casts are sound because
        // `parseSegments` only emits kinds that `ALLOWED_SEGMENTS[kind]`
        // permits — anything else is dropped with a warning.
        if (tok.type === 'item') {
          doc.body.push(parseItem(tok.raw));
        } else if (tok.type === 'sample') {
          doc.body.push({
            type: 'sample',
            content: parseSegments(
              tok.raw,
              'sample block',
              'sample',
            ) as SampleSegment[],
          });
        } else if (tok.type === 'rules') {
          doc.body.push({
            type: 'rules',
            content: parseSegments(
              tok.raw,
              'rules block',
              'rules',
            ) as RulesSegment[],
          });
        } else if (tok.type === 'info') {
          doc.body.push({
            type: 'info',
            content: parseSegments(
              tok.raw,
              'info block',
              'info',
            ) as InfoSegment[],
          });
        } else if (tok.type === 'right') {
          doc.body.push({
            type: 'right-sidebar',
            content: parseSegments(
              tok.raw,
              'right block',
              'right',
            ) as Segment[],
          });
        } else {
          // 'note' | 'head' — both use the floor Segment[].
          doc.body.push({
            type: tok.type,
            content: parseSegments(
              tok.raw,
              `${tok.type} block`,
              tok.type,
            ) as Segment[],
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

// Footnote markers in cell text. The DSL syntax — brackets, `*` for
// unnumbered, digits for numbered — is encapsulated here. The IR exposes only
// the `FootnoteRef` discriminator (`type: 'numbered' | 'unnumbered'` plus a
// `value` for numbered), so the renderer can pick its own glyphs without
// knowing this regex.
const FOOTNOTE_REF_RE = /\[(\*|\d+)]/g;

// Parses a raw cell string. If the cell contains a footnote ref the cell
// becomes a single `FootnoteRef` node wrapping the rest of the text as its
// children. Cells without refs stay as plain `Inline[]`.
//
// Asserts (warns) when the constraints "exactly one ref per cell, trailing
// the text" are violated. Best-effort fallback: keep the last ref's value
// and strip every bracket from the wrapped text.
function parseCellInline(raw: string): CellInline[] {
  const matches = [...raw.matchAll(FOOTNOTE_REF_RE)];
  if (matches.length === 0) return parseInline(raw);

  if (matches.length > 1) {
    console.warn(
      `[scribe] table cell "${raw}" has multiple footnote refs; expected one trailing the text`,
    );
  }
  const last = matches[matches.length - 1]!;
  const tail = raw.slice(last.index + last[0].length).trim();
  if (tail.length > 0) {
    console.warn(
      `[scribe] table cell "${raw}" has a footnote ref that does not trail the text`,
    );
  }

  const stripped = raw.replace(FOOTNOTE_REF_RE, '').trimEnd();
  const children = parseInline(stripped);
  const marker = last[1]!;
  return [
    marker === '*'
      ? { kind: 'footnote-ref', type: 'unnumbered', children }
      : { kind: 'footnote-ref', type: 'numbered', value: marker, children },
  ];
}

function footnoteFromMarker(
  marker: string,
  children: Inline[],
): TableFootnote {
  return marker === '*'
    ? { type: 'unnumbered', children }
    : { type: 'numbered', value: marker, children };
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
  const rawRows: string[][] = [];
  const rawFootnotes: { marker: string; text: string }[] = [];

  let i = sepTok ? start + 2 : start + 1;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === 'table-row') {
      rawRows.push(t.cells);
      i++;
    } else if (t.kind === 'table-footnote') {
      rawFootnotes.push({ marker: t.marker, text: t.text });
      i++;
    } else {
      break;
    }
  }

  // Footnote refs are scoped to tables. We collect referenced markers from
  // raw cell text (before parseInline strips the brackets) and cross-check
  // against defined footnotes — warning on either side of a mismatch.
  const referenced = new Set<string>();
  const collectRefs = (s: string) => {
    for (const m of s.matchAll(FOOTNOTE_REF_RE)) referenced.add(m[1]!);
  };
  for (const c of headerTok.cells) collectRefs(c);
  for (const row of rawRows) for (const c of row) collectRefs(c);
  const defined = new Set(rawFootnotes.map((f) => f.marker));
  for (const ref of referenced) {
    if (!defined.has(ref)) {
      console.warn(
        `[scribe] table cell references [${ref}] but no footnote defines it`,
      );
    }
  }
  for (const def of defined) {
    if (!referenced.has(def)) {
      console.warn(
        `[scribe] table footnote [${def}] is defined but never referenced`,
      );
    }
  }

  const headers = headerTok.cells.map((c) => parseCellInline(c));
  const rows = rawRows.map((row) => row.map((c) => parseCellInline(c)));
  const footnotes: TableFootnote[] = rawFootnotes.map((f) =>
    footnoteFromMarker(f.marker, parseInline(f.text)),
  );

  let caption: CellInline[] | undefined;
  const prev = body[body.length - 1];
  if (prev && prev.type === 'heading' && prev.level >= 4) {
    caption = prev.content;
    body.pop();
  }

  return {
    table: {
      type: 'table',
      headers,
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
  // Narrowing cast: parseSegmentsFromTokens with kind='item' provably emits
  // only ItemSegment kinds (no centered-paragraph, since that's gated to
  // kind='sample'). Same logic applies to the other narrowing casts below.
  const content = parseSegmentsFromTokens(
    tokens.slice(i),
    ctxLabel,
    'item',
  ) as ItemSegment[];

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
  kind: Exclude<ContainerKind, 'body'>,
): AnySegment[] {
  return parseSegmentsFromTokens(tokenize(raw), contextLabel, kind);
}

function parseSegmentsFromTokens(
  tokens: Token[],
  contextLabel: string,
  kind: Exclude<ContainerKind, 'body'>,
): AnySegment[] {
  const segments: AnySegment[] = [];
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
        if (tryPushSegment(segments, { kind: 'hr' }, kind, contextLabel)) {
          firstInSection = true;
        }
        i++;
        continue;
      case 'column-break':
        tryPushSegment(segments, { kind: 'column-break' }, kind, contextLabel);
        i++;
        continue;
      case 'heading':
        if (
          tryPushSegment(
            segments,
            {
              kind: 'heading',
              level: tok.level,
              content: parseInline(tok.text),
            },
            kind,
            contextLabel,
          )
        ) {
          firstInSection = true;
        }
        i++;
        continue;
      case 'centered-text':
        tryPushSegment(
          segments,
          {
            kind: 'centered-paragraph',
            content: parseInline(tok.content),
          },
          kind,
          contextLabel,
        );
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
        if (
          tryPushSegment(
            segments,
            { kind: 'list', items, indent: listIndent(kind) },
            kind,
            contextLabel,
          )
        ) {
          firstInSection = false;
        }
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
        if (
          tryPushSegment(
            segments,
            {
              kind: 'paragraph',
              content,
              indent: paragraphIndent(
                kind,
                firstInSection,
                isBoldLead(content),
              ),
            },
            kind,
            contextLabel,
          )
        ) {
          firstInSection = false;
        }
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
