export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] };

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

export type Segment =
  | { kind: 'paragraph'; content: Inline[]; indent: ParagraphIndent }
  | { kind: 'centered-paragraph'; content: Inline[] }
  | { kind: 'heading'; level: number; content: Inline[] }
  | { kind: 'list'; items: Inline[][]; indent: ListIndent }
  | { kind: 'hr' }
  | { kind: 'column-break' };

export interface PageBreakNode {
  type: 'page-break';
}
export interface ColumnBreakNode {
  type: 'column-break';
}
export interface FullWidthToggleNode {
  type: 'full-width-toggle';
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
export interface TableNode {
  type: 'table';
  headers: Inline[][];
  alignments: Align[];
  rows: Inline[][][];
  caption?: Inline[];
  footnotes: Inline[][];
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
  content: Segment[];
}
export interface InfoBlockNode {
  type: 'info';
  content: Segment[];
}
export interface NoteBlockNode {
  type: 'note';
  content: Segment[];
}
export interface RulesBlockNode {
  type: 'rules';
  content: Segment[];
}
export interface SampleBlockNode {
  type: 'sample';
  content: Segment[];
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
