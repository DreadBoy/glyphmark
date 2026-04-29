export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] };

export type Align = 'left' | 'center' | 'right';

export type Segment =
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'centered-paragraph'; content: Inline[] }
  | { kind: 'heading'; level: number; content: Inline[] }
  | { kind: 'list'; items: Inline[][] }
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
}
export interface TableNode {
  type: 'table';
  headers: Inline[][];
  alignments: Align[];
  rows: Inline[][][];
  caption?: Inline[];
  footnotes: Inline[][];
}
export interface ItemBlockNode {
  type: 'item';
  name: Inline[];
  nameActions?: string;
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
