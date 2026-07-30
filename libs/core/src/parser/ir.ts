/**
 * Opaque, parse-scoped handle to a source token. Ids are allocated per
 * `parseGlyph` call in reading order (pre-order over the token tree), but treat
 * them as opaque: a `TokenId` is valid *only* against the `tokenMap` from the
 * same parse, is **not** stable across edits/re-parses, and carries no meaning
 * across documents. Never compare ids to reconstruct order — reading order
 * comes from walking the IR (`doc.body` plus each block's segment arrays).
 */
export type TokenId = number;

/**
 * Absolute source span of a token. Lines are 1-based and inclusive
 * (`startLine`..`endLine`); offsets are absolute character indices into the
 * original `parseGlyph` input with `endOffset` exclusive. For a token that
 * occupies whole physical lines, `input.slice(startOffset, endOffset)` is the
 * covered line(s) without the trailing newline. The one exception is a child
 * token of a single-line block (e.g. `rule(text)`), whose `startOffset` begins
 * at the inner content rather than at column 0. `startLine`/`endLine` are
 * always the exact physical lines, so line-based anchoring is unaffected.
 */
export type TokenSpan = {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
};

/**
 * Opaque provenance handle on an IR node: the `first` and `last` token the node
 * spans in source. The IR never interprets these — resolve them against
 * {@link GlyphDocument.tokenMap} from the same parse, e.g.
 * `doc.tokenMap.get(node.origin.first)?.startLine` for the start line, or
 * `doc.tokenMap.get(node.origin.last)?.endLine` for a real section-end line.
 * See {@link TokenId} for the validity rules.
 */
export type Origin = { first: TokenId; last: TokenId };

/**
 * Machine-readable category of a {@link Diagnostic}. Prefer switching on this
 * over matching `message`, which is human-facing prose and may be reworded.
 *
 * - `invalid-segment-in-container` — a segment kind the enclosing block does
 *   not accept (e.g. a `heading` inside `item()`); dropped.
 * - `heading-level-unsupported` — a heading deeper than the level cap for its
 *   position (`h5`/`h6` anywhere, `h3`+ inside `head()`/`info()`); dropped.
 * - `centered-text-outside-sample` — a `^ ...` line at the body level. Inside
 *   a non-`sample()` block the same line reports as
 *   `invalid-segment-in-container` instead.
 * - `top-level-hr` — a lone `-` at the body level, where it has no meaning.
 * - `trait-line-outside-item` — a `;a,b` line at the body level. A trait line
 *   inside a non-`item()` block is currently dropped silently, with no
 *   diagnostic at all.
 * - `item-missing-hr` — an `item()` whose heading is not followed by `-`.
 * - `content-ref-nested` — a `key { ... }` definition inside a block; only
 *   body-level definitions are collected.
 * - `leading-divider` / `trailing-divider` — a block's content starts or ends
 *   with `hr`/`column-break`; trimmed.
 * - `column-break-outside-full-width` — `|` inside a `rule()` that is not
 *   full-width; stripped.
 * - `table-ragged-row` — a row whose cell count differs from the table's.
 * - `table-footnote-undefined` — a cell references `[n]` with no matching
 *   footnote definition.
 * - `table-footnote-unreferenced` — a footnote is defined but never used;
 *   anchored at that footnote line.
 * - `table-cell-multiple-footnote-refs` — a cell carries more than one ref.
 * - `table-cell-footnote-ref-not-trailing` — a cell's ref is not at its end.
 */
export type DiagnosticCode =
  | 'invalid-segment-in-container'
  | 'heading-level-unsupported'
  | 'centered-text-outside-sample'
  | 'top-level-hr'
  | 'trait-line-outside-item'
  | 'item-missing-hr'
  | 'content-ref-nested'
  | 'leading-divider'
  | 'trailing-divider'
  | 'column-break-outside-full-width'
  | 'table-ragged-row'
  | 'table-footnote-undefined'
  | 'table-footnote-unreferenced'
  | 'table-cell-multiple-footnote-refs'
  | 'table-cell-footnote-ref-not-trailing';

/**
 * A problem the parser found and recovered from. Parsing never fails — every
 * diagnostic describes something that was dropped, trimmed, or left literal,
 * and the document is still fully renderable — so there is no severity axis:
 * all diagnostics are warnings.
 *
 * `origin` is required and follows the same rules as a node's (see
 * {@link Origin}), so a consumer can underline the offending source range
 * without guarding. The same text is also written to `console.warn`.
 */
export interface Diagnostic {
  code: DiagnosticCode;
  /** Human-facing prose, identical to what is printed to `console.warn`. */
  message: string;
  origin: Origin;
}

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'sup'; children: Inline[] }
  | { kind: 'sub'; children: Inline[] }
  | { kind: 'action'; symbol: ActionSymbol };

/**
 * Action symbols recognised on item headings (e.g. `# Strike :aa:` adds the
 * two-action icon) and inline anywhere in body text (`:a:`, `:aa:`, `:aaa:`,
 * `:r:`, `:f:`). Mirrors the keys of `ACTION_SYMBOLS` in
 * `vendor/action-symbols.ts` — keep the two in sync.
 */
export type ActionSymbol = ':a:' | ':aa:' | ':aaa:' | ':r:' | ':f:';

/**
 * A footnote reference inside a table. The parser detects the kind from DSL
 * syntax (currently `[*]` vs `[N]`); the renderer chooses the glyph (currently
 * `*` vs `<sup>N</sup>`). Either side can change independently.
 */
export type FootnoteRef =
  | { kind: 'footnote-ref'; type: 'unnumbered'; children: Inline[] }
  | {
      kind: 'footnote-ref';
      type: 'numbered';
      value: string;
      children: Inline[];
    };

/**
 * Inlines as they appear inside table cells, headers, and captions — a flat
 * sequence mixing plain `Inline` nodes with `FootnoteRef` markers. By
 * convention a cell carries at most one trailing `FootnoteRef` whose
 * `children` hold the rest of the cell's inline content; cells without refs
 * stay as plain inlines.
 */
export type CellInline = Inline | FootnoteRef;

export type Align = 'left' | 'center' | 'right';

/**
 * How a paragraph's lines align relative to the column edge.
 *
 * - `'none'` — flush left, no first-line indent.
 * - `'first-line'` — standard prose: only the first line is pushed in by
 *   one indent step.
 * - `'hanging'` — every line is pushed in *except* the first, producing the
 *   bold-leading "definition list" look (e.g. **Critical Success** ...).
 */
export type ParagraphIndent = 'none' | 'first-line' | 'hanging';

/**
 * How a list aligns relative to the column edge.
 *
 * - `'none'` — flush with the column edge.
 * - `'block'` — the whole list is pushed in by one indent step.
 */
export type ListIndent = 'none' | 'block';

/**
 * The smallest set of segment kinds that every container block accepts. Wider
 * unions (`ItemSegment`, `SampleSegment`) extend this for blocks that admit
 * extra kinds, so that nodes outside those containers can never carry the
 * extras at the type level.
 *
 * Like {@link BodyNode}, every segment carries a required {@link Origin} —
 * so a consumer walking into a block's content keeps exact source anchoring
 * all the way down, instead of bottoming out at the enclosing block.
 */
export type Segment =
  | {
      kind: 'paragraph';
      content: Inline[];
      indent: ParagraphIndent;
      origin: Origin;
    }
  | { kind: 'heading'; content: Inline[]; level: number; origin: Origin };

/**
 * Item blocks add lists, the section-divider `hr`, and column breaks. They do
 * *not* allow `heading` segments — the leading h1/h2 of an item are consumed
 * by the parser into `ItemBlockNode.name` and `.subtitle`; any further
 * heading inside the item body is a parse-time error and is warned/dropped.
 */
export type ItemSegment =
  | {
      kind: 'paragraph';
      content: Inline[];
      indent: ParagraphIndent;
      origin: Origin;
    }
  | { kind: 'list'; items: Inline[][]; indent: ListIndent; origin: Origin }
  | { kind: 'hr'; origin: Origin }
  | { kind: 'column-break'; origin: Origin }
  | { kind: 'page-break'; origin: Origin };

/**
 * Sample blocks add `centered-paragraph` (the `^ ...` line marker, used for
 * centered formula display).
 */
export type SampleSegment =
  | Segment
  | { kind: 'centered-paragraph'; content: Inline[]; origin: Origin };

/**
 * Rule blocks add lists, tables, and column breaks. Column breaks are only
 * valid in full-width rule blocks (where they split inner content into two
 * columns *inside* the block, rather than ending the page column).
 */
export type RuleSegment =
  | Segment
  | { kind: 'list'; items: Inline[][]; indent: ListIndent; origin: Origin }
  | { kind: 'column-break'; origin: Origin }
  // The wrapper's `origin` mirrors `node.origin`, so `segment.origin` is total
  // across every segment kind and a consumer never has to special-case tables.
  | { kind: 'table'; node: TableNode; origin: Origin };

/**
 * Info blocks add column breaks (used to split a callout across two columns).
 */
export type InfoSegment = Segment | { kind: 'column-break'; origin: Origin };

export interface PageBreakNode {
  type: 'page-break';
  origin: Origin;
}
export interface ColumnBreakNode {
  type: 'column-break';
  /**
   * `true` when no real body content follows this break. Set by the parser in
   * a post-pass; the renderer uses it to emit a sentinel element so the CSS
   * column balancer still honours the break (otherwise balance mode pulls
   * content back across the break when column 2 would be empty).
   */
  trailing: boolean;
  origin: Origin;
}
export interface FullWidthToggleNode {
  type: 'full-width-toggle';
  /**
   * 1-based monotonic position among all toggles in the document. Odd indexes
   * enter full-width; even indexes leave it.
   */
  index: number;
  origin: Origin;
}
export interface ParagraphNode {
  type: 'paragraph';
  content: Inline[];
  indent: ParagraphIndent;
  origin: Origin;
}
export interface HeadingNode {
  type: 'heading';
  level: number;
  content: Inline[];
  origin: Origin;
}
export interface ListNode {
  type: 'list';
  items: Inline[][];
  indent: ListIndent;
  origin: Origin;
}
/**
 * Footnote definition at the bottom of a table. Mirrors `FootnoteRef`: the
 * parser tags each one as numbered or unnumbered; the renderer decides how
 * to display the marker.
 */
export type TableFootnote =
  | { type: 'unnumbered'; children: Inline[] }
  | { type: 'numbered'; value: string; children: Inline[] };

export interface TableNode {
  type: 'table';
  /** Number of columns, fixed by the opening row that every data row is checked against. */
  colCount: number;
  /**
   * Header cells, one per column. Empty for a headerless table. A header row
   * always has at least one cell, so an empty array unambiguously means
   * "no header".
   */
  headers: CellInline[][];
  alignments: Align[];
  rows: CellInline[][][];
  caption?: CellInline[];
  footnotes: TableFootnote[];
  origin: Origin;
}
export interface ItemBlockNode {
  type: 'item';
  name: Inline[];
  action?: ActionSymbol;
  subtitle?: Inline[];
  traits: string[];
  content: ItemSegment[];
  origin: Origin;
}
export interface InfoBlockNode {
  type: 'info';
  content: InfoSegment[];
  origin: Origin;
}
export interface RuleBlockNode {
  type: 'rule';
  /**
   * `true` when the block is rendered full-width (i.e. between two `/`
   * full-width-toggle markers). Inner column breaks are only honoured when
   * full-width is `true`; outside of that they're stripped with a warning.
   */
  fullWidth: boolean;
  content: RuleSegment[];
  origin: Origin;
}
export interface SampleBlockNode {
  type: 'sample';
  content: SampleSegment[];
  origin: Origin;
}
export interface HeadBlockNode {
  type: 'head';
  content: Segment[];
  origin: Origin;
}

export type BodyNode =
  | PageBreakNode
  | ColumnBreakNode
  | FullWidthToggleNode
  | ParagraphNode
  | HeadingNode
  | ListNode
  | TableNode
  | ItemBlockNode
  | InfoBlockNode
  | RuleBlockNode
  | SampleBlockNode
  | HeadBlockNode;

export interface GlyphDocument {
  customCss?: string;
  fonts?: string[];
  /**
   * Map of `key` → the pre-parsed body nodes that a `{{key}}` reference
   * expands to. Reference definitions (`key { ... }`) are parsed into
   * Node-level body content at collection time, so any segment-only tokens
   * in a definition (lone `hr`, trait lines, etc.) are warned about and
   * dropped at parse time — even if the reference is never used. References
   * inside a definition stay literal: references don't nest.
   */
  contentRefs: Map<string, BodyNode[]>;
  /**
   * Flat lookup from every {@link TokenId} produced by this parse to its source
   * {@link TokenSpan}. Resolve a node's {@link Origin} against this map, e.g.
   * `tokenMap.get(node.origin.first)?.startLine` for the start line. Built once
   * per `parseGlyph` call; valid only for handles from the same parse.
   */
  tokenMap: Map<TokenId, TokenSpan>;
  /**
   * Every problem the parser recovered from, each anchored to the source that
   * caused it (see {@link Diagnostic}). Empty for a clean document.
   * Diagnostics raised while parsing a `key { ... }` definition are collected
   * once, at collection time, and are not repeated per `{{key}}` expansion.
   *
   * Ordered by when the parser found them, which is *not* source order: ref
   * definitions are collected in a pre-pass, so a diagnostic from a definition
   * in the hidden section past `%` precedes one from line 1 of the body. Sort
   * by resolved line via {@link tokenMap} if you need source order.
   */
  diagnostics: Diagnostic[];
  body: BodyNode[];
}
