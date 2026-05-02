export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] };

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
 * Item blocks add lists, the section-divider `hr`, and column breaks.
 */
export type ItemSegment =
  | Segment
  | { kind: 'list'; items: Inline[][]; indent: ListIndent }
  | { kind: 'hr' }
  | { kind: 'column-break' };

/**
 * Sample blocks add `centered-paragraph` (the `^ ...` line marker, used for
 * centered formula display).
 */
export type SampleSegment =
  | Segment
  | { kind: 'centered-paragraph'; content: Inline[] };

/**
 * Rules blocks add lists and column breaks.
 */
export type RulesSegment =
  | Segment
  | { kind: 'list'; items: Inline[][]; indent: ListIndent }
  | { kind: 'column-break' };

/**
 * Info blocks add column breaks (used to split a callout across two columns).
 */
export type InfoSegment = Segment | { kind: 'column-break' };

export interface PageBreakNode {
  type: 'page-break';
}
export interface ColumnBreakNode {
  type: 'column-break';
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
export interface CenteredParagraphNode {
  type: 'centered-paragraph';
  content: Inline[];
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
  headers: CellInline[][];
  alignments: Align[];
  rows: CellInline[][][];
  caption?: CellInline[];
  footnotes: TableFootnote[];
}
/**
 * Action symbols recognised on item headings, e.g. `# Strike :aa:` adds the
 * two-action icon. Mirrors the keys of `ACTION_SYMBOLS` in
 * `vendor/action-symbols.ts` — keep the two in sync.
 */
export type ActionSymbol = ':a:' | ':aa:' | ':aaa:' | ':r:' | ':f:';

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
export interface NoteBlockNode {
  type: 'note';
  content: Segment[];
}
export interface RulesBlockNode {
  type: 'rules';
  content: RulesSegment[];
}
export interface SampleBlockNode {
  type: 'sample';
  content: SampleSegment[];
}
export interface HeadBlockNode {
  type: 'head';
  content: Segment[];
}
export interface RightSidebarNode {
  type: 'right-sidebar';
  content: Segment[];
}

export type BodyNode =
  | PageBreakNode
  | ColumnBreakNode
  | FullWidthToggleNode
  | ParagraphNode
  | CenteredParagraphNode
  | HeadingNode
  | ListNode
  | TableNode
  | ItemBlockNode
  | InfoBlockNode
  | NoteBlockNode
  | RulesBlockNode
  | SampleBlockNode
  | HeadBlockNode
  | RightSidebarNode;

export interface ScribeDocument {
  watermark?: string;
  customCss?: string;
  fonts?: string[];
  pageNumbers: boolean;
  contentRefs: Map<string, string>;
  body: BodyNode[];
}
