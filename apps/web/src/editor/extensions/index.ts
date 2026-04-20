import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableHeader, TableCell } from './Table';
import { DocNode } from './DocNode';
import { PageNode } from './PageNode';
import { PageDecorations } from './PageDecorations';
import { OrdinalHeading } from './OrdinalHeading';
import { ActionSymbol } from './ActionSymbol';
import {
  HeadBlock,
  InfoBlock,
  RulesBlock,
  NoteBlock,
  MathBlock,
  LeftSidebar,
  RightSidebar,
} from './StyledBlocks';
import { Columns, Column } from './Columns';
import { SectionDivider, Clear } from './Dividers';
import { TableFooter } from './TableFooter';
import { ItemBlock } from './ItemBlock';
import { TraitList } from './TraitList';
import { ParagraphClass } from './ParagraphClass';

export const scribeExtensions = [
  DocNode,
  StarterKit.configure({
    document: false,
    codeBlock: false,
    code: false,
    blockquote: false,
  }),
  PageNode,
  PageDecorations,
  OrdinalHeading,
  ActionSymbol,
  HeadBlock,
  InfoBlock,
  RulesBlock,
  NoteBlock,
  MathBlock,
  LeftSidebar,
  RightSidebar,
  Columns,
  Column,
  SectionDivider,
  Clear,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  TableFooter,
  ItemBlock,
  TraitList,
  ParagraphClass,
];
