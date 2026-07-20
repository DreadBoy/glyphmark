import type {
  ActionSymbol,
  BodyNode,
  CellInline,
  ColumnBreakNode,
  Inline,
  InfoSegment,
  ItemBlockNode,
  ItemSegment,
  ListIndent,
  ParagraphIndent,
  RuleBlockNode,
  RuleSegment,
  SampleSegment,
  GlyphDocument,
  Segment,
  TableFootnote,
  TableNode,
} from './ir';
import { parseInline } from './inline';
import { tokenize, type Token } from './lexer';

// Container kinds drive per-block indent decisions. "body" is the document
// level (normal text); the rest correspond to block-open keywords.
type ContainerKind = 'body' | 'item' | 'rule' | 'sample' | 'info' | 'head';

// Widest possible segment shape the parser can emit. Each caller narrows to
// its concrete container segment type via a (provably sound) cast — the
// parser only emits kinds that the container's allowed-set permits.
type AnySegment = ItemSegment | SampleSegment | RuleSegment | InfoSegment;
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
  // `heading` is intentionally absent: the leading h1/h2 of an item are
  // consumed by parseItem into `name`/`subtitle`. Any further heading in the
  // body is parse-time invalid and gets warn-and-dropped.
  item: new Set(['paragraph', 'list', 'column-break', 'page-break', 'hr']),
  sample: new Set(['paragraph', 'heading', 'centered-paragraph']),
  rule: new Set(['paragraph', 'heading', 'list', 'column-break', 'table']),
  info: new Set(['paragraph', 'heading', 'column-break']),
  head: new Set(['paragraph', 'heading']),
};

// Global cap on heading levels — the lexer can emit h1..h6 but the renderer
// only styles h1..h4. Anything above this is warn-and-dropped at parse time.
export const MAX_HEADING_LEVEL_DEFAULT = 4;

// Per-container cap on heading levels, *tighter* than the global default.
// Containers absent from the map fall back to MAX_HEADING_LEVEL_DEFAULT.
// Exported so tests can drive a level matrix off the same table.
export const MAX_HEADING_LEVEL: Partial<
  Record<Exclude<ContainerKind, 'body'>, number>
> = {
  head: 2,
  info: 2,
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
    `[glyph] ${contextLabel}: ${seg.kind} is not valid inside ${kind}(); ignoring`,
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
  // body and rule use the standard prose rule: 1st flush, 2nd+ first-line.
  if (kind === 'body' || kind === 'rule') {
    return firstInSection ? 'none' : 'first-line';
  }
  // sample, info, head — paragraphs sit flush.
  return 'none';
}

function listIndent(kind: ContainerKind): ListIndent {
  // Lists hang in by one indent step in body and item containers; everywhere
  // else they sit flush with the column edge.
  if (kind === 'body' || kind === 'item') return 'block';
  return 'none';
}

export function parse(input: string): GlyphDocument {
  const tokens = tokenize(input);
  const doc: GlyphDocument = {
    contentRefs: new Map(),
    body: [],
  };

  // Collect top-level ref definitions. A definition may sit in the visible
  // body or in the hidden section past `%`, but not nested inside a block —
  // nested ones are rejected with a warning by the segment parser.
  collectContentRefs(tokens, doc.contentRefs);

  const hiddenIdx = tokens.findIndex((t) => t.kind === 'hidden-delimiter');
  const visible = hiddenIdx === -1 ? tokens : tokens.slice(0, hiddenIdx);
  parseBody(visible, doc);

  // Flag every column-break in the trailing run (no real body content after
  // it). The renderer uses this to decide whether to emit the balancer-defeat
  // sentinel.
  const lastReal = doc.body.findLastIndex((n) => n.type !== 'column-break');
  doc.body.slice(lastReal + 1).forEach((n) => {
    (n as ColumnBreakNode).trailing = true;
  });

  return doc;
}

function parseBody(tokens: Token[], doc: GlyphDocument): void {
  let i = 0;
  // "First in section" means: this is the first paragraph since the start of
  // the body or since the last semantic reset (heading, full-width toggle, or
  // a container block). It controls whether we apply the first-line indent.
  let firstInSection = true;
  let fullWidthToggleIdx = 0;
  // Tracks whether subsequent body nodes will render in the full-width band.
  // Each `/` toggle flips this, matching how FullWidthStyles cascades. Used to
  // gate column-break inside rule() blocks — those are only valid full-width.
  let fullWidth = false;
  while (i < tokens.length) {
    const tok = tokens[i];

    switch (tok.kind) {
      case 'preamble':
        if (tok.type === 'css') {
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
        doc.body.push({ type: 'column-break', trailing: false });
        i++;
        continue;

      case 'full-width-toggle':
        doc.body.push({
          type: 'full-width-toggle',
          index: ++fullWidthToggleIdx,
        });
        fullWidth = !fullWidth;
        firstInSection = true;
        i++;
        continue;

      case 'heading':
        if (tok.level > MAX_HEADING_LEVEL_DEFAULT) {
          console.warn(
            `[glyph] h${tok.level} is not valid; only h1..h${MAX_HEADING_LEVEL_DEFAULT} are supported`,
          );
          i++;
          continue;
        }
        doc.body.push({
          type: 'heading',
          level: tok.level,
          content: parseInline(tok.text),
        });
        firstInSection = true;
        i++;
        continue;

      case 'list-item': {
        const items: Inline[][] = [];
        while (i < tokens.length) {
          const t = tokens[i];
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

      // `table-header` opens a table with a header row; a standalone
      // `table-sep` opens a headerless one (the lexer only emits a bare
      // `table-sep` for the headerless form — the header form's separator is
      // consumed by buildTable, so it never reaches here on its own).
      case 'table-header':
      case 'table-sep': {
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
        } else if (tok.type === 'rule') {
          doc.body.push(parseRule(tok.raw, fullWidth));
        } else if (tok.type === 'info') {
          doc.body.push({
            type: 'info',
            content: parseSegments(
              tok.raw,
              'info block',
              'info',
            ) as InfoSegment[],
          });
        } else {
          // 'head' — floor Segment[].
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

      case 'reference': {
        // Block-level content reference. The reference definition's body
        // nodes were parsed and validated at collection time, so expansion
        // is just appending a clone of those nodes here. Unknown keys emit
        // the reference as literal text so the user can spot the typo.
        const refNodes = doc.contentRefs.get(tok.key);
        if (refNodes !== undefined) {
          for (const n of refNodes) doc.body.push(structuredClone(n));
          firstInSection = true;
          i++;
          continue;
        }
        const literal = parseInline(`{{${tok.key}}}`);
        doc.body.push({
          type: 'paragraph',
          content: literal,
          indent: paragraphIndent('body', firstInSection, isBoldLead(literal)),
        });
        firstInSection = false;
        i++;
        continue;
      }

      case 'text': {
        const lines: string[] = [tok.content];
        i++;
        while (i < tokens.length && tokens[i].kind === 'text') {
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
      case 'centered-text':
        console.warn(
          '[glyph] centered text (^) is only valid inside sample() blocks; ignoring',
        );
        i++;
        continue;
      case 'hr':
        console.warn('[glyph] top-level hr (lone -) is not valid; ignoring');
        i++;
        continue;
      case 'trait-line':
        console.warn(
          '[glyph] trait line (;) is only valid inside item(); ignoring',
        );
        i++;
        continue;
      case 'table-row':
      case 'table-footnote':
        // Only valid as part of a table (opened above); stray here — drop.
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
      `[glyph] table cell "${raw}" has multiple footnote refs; expected one trailing the text`,
    );
  }
  const last = matches[matches.length - 1];
  const tail = raw.slice(last.index + last[0].length).trim();
  if (tail.length > 0) {
    console.warn(
      `[glyph] table cell "${raw}" has a footnote ref that does not trail the text`,
    );
  }

  const stripped = raw.replace(FOOTNOTE_REF_RE, '').trimEnd();
  const children = parseInline(stripped);
  const marker = last[1];
  return [
    marker === '*'
      ? { kind: 'footnote-ref', type: 'unnumbered', children }
      : { kind: 'footnote-ref', type: 'numbered', value: marker, children },
  ];
}

function footnoteFromMarker(marker: string, children: Inline[]): TableFootnote {
  return marker === '*'
    ? { type: 'unnumbered', children }
    : { type: 'numbered', value: marker, children };
}

// Builds a TableNode from the rows/footnotes that follow a table's opening
// token. That opener is either a `table-header` (with its `table-sep` right
// after) or, for a headerless table, a standalone `table-sep`. A headerless
// table yields an empty `headers` array. Caller is responsible for caption
// lifting (the preceding heading4+ in its own array — body or segment list).
function buildTable(
  tokens: Token[],
  start: number,
): { node: TableNode; next: number } {
  const first = tokens[start];
  const headerless = first.kind === 'table-sep';
  const headerTok = headerless
    ? undefined
    : (first as Extract<Token, { kind: 'table-header' }>);
  const sepTok = headerless
    ? (first as Extract<Token, { kind: 'table-sep' }>)
    : tokens[start + 1]?.kind === 'table-sep'
      ? (tokens[start + 1] as Extract<Token, { kind: 'table-sep' }>)
      : undefined;
  const rawRows: string[][] = [];
  const rawFootnotes: { marker: string; text: string }[] = [];

  let i = headerless ? start + 1 : sepTok ? start + 2 : start + 1;
  while (i < tokens.length) {
    const t = tokens[i];
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
    for (const m of s.matchAll(FOOTNOTE_REF_RE)) referenced.add(m[1]);
  };
  for (const c of headerTok?.cells ?? []) collectRefs(c);
  for (const row of rawRows) for (const c of row) collectRefs(c);
  const defined = new Set(rawFootnotes.map((f) => f.marker));
  for (const ref of referenced) {
    if (!defined.has(ref)) {
      console.warn(
        `[glyph] table cell references [${ref}] but no footnote defines it`,
      );
    }
  }
  for (const def of defined) {
    if (!referenced.has(def)) {
      console.warn(
        `[glyph] table footnote [${def}] is defined but never referenced`,
      );
    }
  }

  // The opening row fixes the column count — the header for a normal table,
  // the separator (its alignment count) for a headerless one. Every data row
  // must match it; a ragged row is almost always a missing or stray `|`.
  const colCount = headerTok
    ? headerTok.cells.length
    : (sepTok?.aligns.length ?? 0);
  for (const row of rawRows) {
    if (row.length !== colCount) {
      console.warn(
        `[glyph] table row "${row.join(' | ')}" has ${row.length} cells but the table has ${colCount} columns`,
      );
    }
  }

  const headers = (headerTok?.cells ?? []).map((c) => parseCellInline(c));
  const rows = rawRows.map((row) => row.map((c) => parseCellInline(c)));
  const footnotes: TableFootnote[] = rawFootnotes.map((f) =>
    footnoteFromMarker(f.marker, parseInline(f.text)),
  );

  return {
    node: {
      type: 'table',
      colCount,
      headers,
      alignments: sepTok?.aligns ?? [],
      rows,
      footnotes,
    },
    next: i,
  };
}

function consumeTable(
  tokens: Token[],
  start: number,
  body: BodyNode[],
): { table: TableNode; next: number } {
  const { node, next } = buildTable(tokens, start);
  const prev = body[body.length - 1];
  if (prev && prev.type === 'heading' && prev.level >= 4) {
    node.caption = prev.content;
    body.pop();
  }
  return { table: node, next };
}

function parseRule(raw: string, fullWidth: boolean): RuleBlockNode {
  const content = parseSegments(raw, 'rule block', 'rule') as RuleSegment[];
  // Column breaks inside rule() create a 2-column inner layout, but only when
  // the block is rendered full-width. Outside of full-width they have no
  // sensible meaning (the surrounding 2-column flow already handles that), so
  // we strip them with a warning.
  if (!fullWidth) {
    const filtered: RuleSegment[] = [];
    for (const seg of content) {
      if (seg.kind === 'column-break') {
        console.warn(
          '[glyph] rule block: column-break is only valid inside a full-width rule block; ignoring',
        );
        continue;
      }
      filtered.push(seg);
    }
    return { type: 'rule', fullWidth, content: filtered };
  }
  return { type: 'rule', fullWidth, content };
}

function parseItem(raw: string): ItemBlockNode {
  const tokens = tokenize(raw);
  let i = 0;
  let name: Inline[] = [];
  let action: ActionSymbol | undefined;
  let subtitle: Inline[] | undefined;
  const traits: string[] = [];

  while (i < tokens.length && tokens[i].kind === 'blank') i++;

  // Name (h1)
  if (i < tokens.length) {
    const t = tokens[i];
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

  while (i < tokens.length && tokens[i].kind === 'blank') i++;

  // Subtitle (h2)
  if (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'heading' && t.level === 2) {
      subtitle = parseInline(t.text);
      i++;
    }
  }

  while (i < tokens.length && tokens[i].kind === 'blank') i++;

  // Mandatory hr
  if (i < tokens.length && tokens[i].kind === 'hr') {
    i++;
  } else {
    console.warn('[glyph] item: missing hr separator after heading');
  }

  while (i < tokens.length && tokens[i].kind === 'blank') i++;

  // Optional traits (one or more `;` lines)
  while (i < tokens.length && tokens[i].kind === 'trait-line') {
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
    const tok = tokens[i];
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
      case 'page-break':
        tryPushSegment(segments, { kind: 'page-break' }, kind, contextLabel);
        i++;
        continue;
      case 'heading': {
        const maxLevel = MAX_HEADING_LEVEL[kind] ?? MAX_HEADING_LEVEL_DEFAULT;
        if (tok.level > maxLevel) {
          console.warn(
            `[glyph] ${contextLabel}: h${tok.level} is not valid inside ${kind}() (only h1..h${maxLevel}); ignoring`,
          );
          i++;
          continue;
        }
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
      }
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
          const t = tokens[i];
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
        while (i < tokens.length && tokens[i].kind === 'text') {
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
      case 'table-header':
      case 'table-sep': {
        const { node, next } = buildTable(tokens, i);
        // Caption-lift: a preceding heading4+ segment becomes the table's
        // caption. Same rule as body-level tables (see consumeTable).
        const prev = segments[segments.length - 1];
        if (prev && prev.kind === 'heading' && prev.level >= 4) {
          node.caption = prev.content;
          segments.pop();
        }
        if (
          tryPushSegment(segments, { kind: 'table', node }, kind, contextLabel)
        ) {
          firstInSection = false;
        }
        i = next;
        continue;
      }
      case 'content-ref':
        console.warn(
          `[glyph] ${contextLabel}: content reference "${tok.key} { ... }" must live at the body level, not inside a block; ignoring`,
        );
        i++;
        continue;
      case 'reference': {
        // References only expand at the body level. Inside a block we surface
        // the reference as literal text so the user can spot it instead of
        // having it silently dropped.
        const literal = parseInline(`{{${tok.key}}}`);
        if (
          tryPushSegment(
            segments,
            {
              kind: 'paragraph',
              content: literal,
              indent: paragraphIndent(kind, firstInSection, false),
            },
            kind,
            contextLabel,
          )
        ) {
          firstInSection = false;
        }
        i++;
        continue;
      }
      default:
        // Drop block-opens and stray page/column break tokens that don't
        // belong inside a segment list.
        i++;
        continue;
    }
  }

  // Validation: leading/trailing hr or column-break is invalid.
  while (segments.length > 0) {
    const head = segments[0];
    if (head.kind === 'hr' || head.kind === 'column-break') {
      console.warn(
        `[glyph] ${contextLabel}: leading ${head.kind} is invalid; content must start with text`,
      );
      segments.shift();
    } else break;
  }
  while (segments.length > 0) {
    const tail = segments[segments.length - 1];
    if (tail.kind === 'hr' || tail.kind === 'column-break') {
      console.warn(`[glyph] ${contextLabel}: trailing ${tail.kind} is invalid`);
      segments.pop();
    } else break;
  }

  return segments;
}

function collectContentRefs(
  tokens: Token[],
  refs: Map<string, BodyNode[]>,
): void {
  // Top-level only. Definitions sit at the same level as other blocks (visible
  // body or the hidden section past `%`). A `key { ... }` inside a block body
  // is rejected by the block's segment parser with a warning — we don't pull
  // it up into the refs map.
  //
  // Each definition is parsed into Node-level body content via a throwaway
  // sub-doc whose own refs map is empty: that simultaneously validates the
  // definition (any non-Node-level constructs warn at parse time) and ensures
  // that references inside a definition stay literal, so references can't
  // nest.
  for (const t of tokens) {
    if (t.kind !== 'content-ref') continue;
    const subDoc: GlyphDocument = {
      contentRefs: new Map(),
      body: [],
    };
    parseBody(tokenize(t.content), subDoc);
    refs.set(t.key, subDoc.body);
  }
}

function inlineToString(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.kind === 'text') return n.text;
      if (n.kind === 'action') return n.symbol;
      return inlineToString(n.children);
    })
    .join('');
}
