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
 */
export type Segment =
  | { kind: 'paragraph'; content: Inline[]; indent: ParagraphIndent }
  | { kind: 'heading'; content: Inline[]; level: number };

/**
 * Item blocks add lists, the section-divider `hr`, and column breaks. They do
 * *not* allow `heading` segments — the leading h1/h2 of an item are consumed
 * by the parser into `ItemBlockNode.name` and `.subtitle`; any further
 * heading inside the item body is a parse-time error and is warned/dropped.
 */
export type ItemSegment =
  | { kind: 'paragraph'; content: Inline[]; indent: ParagraphIndent }
  | { kind: 'list'; items: Inline[][]; indent: ListIndent }
  | { kind: 'hr' }
  | { kind: 'column-break' }
  | { kind: 'page-break' };

/**
 * Sample blocks add `centered-paragraph` (the `^ ...` line marker, used for
 * centered formula display).
 */
export type SampleSegment =
  | Segment
  | { kind: 'centered-paragraph'; content: Inline[] };

/**
 * Rule blocks add lists, tables, and column breaks. Column breaks are only
 * valid in full-width rule blocks (where they split inner content into two
 * columns *inside* the block, rather than ending the page column).
 */
export type RuleSegment =
  | Segment
  | { kind: 'list'; items: Inline[][]; indent: ListIndent }
  | { kind: 'column-break' }
  | { kind: 'table'; node: TableNode };

/**
 * Info blocks add column breaks (used to split a callout across two columns).
 */
export type InfoSegment = Segment | { kind: 'column-break' };

/**
 * Sidebar blocks are the tinted margin/aside callouts. They accept the same
 * content as `rule()` *minus* column breaks — a `#`/`##` title plus paragraphs,
 * lists, and tables. A sidebar is single-column, so an inner column break has
 * no meaning; it's warn-and-dropped by the allow-list.
 */
export type SidebarSegment =
  | Segment
  | { kind: 'list'; items: Inline[][]; indent: ListIndent }
  | { kind: 'table'; node: TableNode };

export interface PageBreakNode {
  type: 'page-break';
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
}
export interface FullWidthToggleNode {
  type: 'full-width-toggle';
  /**
   * 1-based monotonic position among all toggles in the document. Odd indexes
   * enter full-width; even indexes leave it.
   */
  index: number;
}
export interface ParagraphNode {
  type: 'paragraph';
  content: Inline[];
  indent: ParagraphIndent;
}
export interface HeadingNode {
  type: 'heading';
  level: number;
  content: Inline[];
}
export interface ListNode {
  type: 'list';
  items: Inline[][];
  indent: ListIndent;
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
}
export interface ItemBlockNode {
  type: 'item';
  name: Inline[];
  action?: ActionSymbol;
  subtitle?: Inline[];
  traits: string[];
  content: ItemSegment[];
}
export interface InfoBlockNode {
  type: 'info';
  content: InfoSegment[];
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
}
export interface SampleBlockNode {
  type: 'sample';
  content: SampleSegment[];
}
export interface HeadBlockNode {
  type: 'head';
  content: Segment[];
}
export interface SidebarBlockNode {
  type: 'sidebar';
  content: SidebarSegment[];
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
  | HeadBlockNode
  | SidebarBlockNode;

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
  body: BodyNode[];
}
