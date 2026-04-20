import { Text } from '@tiptap/extension-text';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Heading } from '@tiptap/extension-heading';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Strike } from '@tiptap/extension-strike';
import { HardBreak } from '@tiptap/extension-hard-break';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { BulletList } from '@tiptap/extension-bullet-list';
import { ListItem } from '@tiptap/extension-list-item';
import { Link as BaseLink } from '@tiptap/extension-link';

const Link = BaseLink.extend({
  addAttributes() {
    return {
      href: { default: null },
    };
  },
});
import { UndoRedo, Dropcursor, Gapcursor } from '@tiptap/extensions';
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
import { AutoHang } from './AutoHang';
import { PasteSanitizer } from './PasteSanitizer';
import { LinkInputRule } from './LinkInputRule';
import { SlashCommands } from './slash/SlashCommands';

export const scribeExtensions = [
  DocNode,
  Text,
  Paragraph,
  Heading,
  Bold,
  Italic,
  Strike,
  Link,
  HardBreak,
  HorizontalRule,
  BulletList,
  ListItem,
  UndoRedo,
  Dropcursor,
  Gapcursor,
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
  AutoHang,
  PasteSanitizer,
  LinkInputRule,
  SlashCommands,
];
