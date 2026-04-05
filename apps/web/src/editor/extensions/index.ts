import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { InfoBlock, NoteBlock, RulesBlock, MathBlock, HeadBlock, LeftSidebar, RightSidebar } from './StyledBlock';
import { ItemBlock } from './ItemBlock';
import { TraitList } from './TraitList';
import { ActionSymbol } from './ActionSymbol';
import { PageBreak } from './PageBreak';
import { SlashCommands } from './SlashCommands';

export const scribeExtensions = [
  StarterKit.configure({
    // We keep heading, paragraph, bold, italic, bulletList, listItem, horizontalRule
    // Disable codeBlock since we don't use it
    codeBlock: false,
    code: false,
    blockquote: false,
  }),
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
  PageBreak,
  SlashCommands,
];
