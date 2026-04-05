import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { InfoBlock, NoteBlock, RulesBlock, MathBlock, HeadBlock, LeftSidebar, RightSidebar } from './StyledBlock';
import { ItemBlock } from './ItemBlock';
import { TraitList } from './TraitList';
import { ActionSymbol } from './ActionSymbol';
import { TableFooter } from './TableFooter';
import { DocNode } from './DocNode';
import { PageNode } from './PageNode';
import { SlashCommands } from './SlashCommands';

export const scribeExtensions = [
  DocNode,
  StarterKit.configure({
    // Disable the default doc since we provide our own
    document: false,
    codeBlock: false,
    code: false,
    blockquote: false,
  }),
  PageNode,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  InfoBlock,
  NoteBlock,
  RulesBlock,
  MathBlock,
  HeadBlock,
  LeftSidebar,
  RightSidebar,
  ItemBlock,
  TraitList,
  ActionSymbol,
  TableFooter,
  SlashCommands,
];
