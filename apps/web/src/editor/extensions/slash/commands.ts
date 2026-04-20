import type { Editor, Range } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

export type SlashCommand = {
  id: string;
  label: string;
  description: string;
  icon: string;
  aliases?: string[];
  run: (editor: Editor, range: Range) => void;
};

export type SlashSection = {
  section: string;
  items: SlashCommand[];
};

function emptyParagraph() {
  return { type: 'paragraph' };
}

function blockWithParagraph(type: string) {
  return {
    type,
    content: [emptyParagraph()],
  };
}

function columnsOfN(n: number) {
  return {
    type: 'columns',
    content: Array.from({ length: n }, () => ({
      type: 'column',
      content: [emptyParagraph()],
    })),
  };
}

function insertBlock(editor: Editor, range: Range, node: unknown) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(node as never)
    .run();
}

function insertColumns(editor: Editor, range: Range, n: number) {
  const { from } = range;
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(columnsOfN(n) as never)
    .run();
  // insertContent leaves cursor at end of the inserted columns (in the last
  // column). Move it into the first column so typing proceeds left-to-right.
  const { state } = editor;
  let target: number | null = null;
  state.doc.descendants((node, pos) => {
    if (target !== null) return false;
    if (pos < from) return true;
    if (node.type.name === 'column') {
      target = pos + 2; // +1 for column open, +1 for paragraph open
      return false;
    }
    return true;
  });
  if (target !== null) {
    editor.commands.setTextSelection(target);
  }
}

function insertInline(editor: Editor, range: Range, node: unknown) {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent(node as never)
    .run();
}

export const SLASH_SECTIONS: SlashSection[] = [
  {
    section: 'Basic',
    items: [
      {
        id: 'text',
        label: 'Text',
        description: 'Plain paragraph',
        icon: 'T',
        aliases: ['paragraph', 'p'],
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).setParagraph().run();
        },
      },
      {
        id: 'h1',
        label: 'Heading 1',
        description: 'Large section heading',
        icon: 'H1',
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 1 })
            .run();
        },
      },
      {
        id: 'h2',
        label: 'Heading 2',
        description: 'Medium heading',
        icon: 'H2',
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 2 })
            .run();
        },
      },
      {
        id: 'h3',
        label: 'Heading 3',
        description: 'Small heading',
        icon: 'H3',
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 3 })
            .run();
        },
      },
      {
        id: 'h4',
        label: 'Heading 4',
        description: 'Banner heading',
        icon: 'H4',
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 4 })
            .run();
        },
      },
      {
        id: 'h5',
        label: 'Heading 5',
        description: 'Small-caps heading',
        icon: 'H5',
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 5 })
            .run();
        },
      },
      {
        id: 'h6',
        label: 'Heading 6',
        description: 'Smallest heading',
        icon: 'H6',
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .setNode('heading', { level: 6 })
            .run();
        },
      },
      {
        id: 'bullet',
        label: 'Bullet list',
        description: 'Unordered list',
        icon: '•',
        aliases: ['ul', 'list'],
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run();
        },
      },
    ],
  },
  {
    section: 'Dividers',
    items: [
      {
        id: 'hr',
        label: 'Horizontal rule',
        description: 'Thin divider',
        icon: '—',
        aliases: ['divider'],
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).setHorizontalRule().run();
        },
      },
      {
        id: 'section-divider',
        label: 'Section divider',
        description: 'Extra-spaced break between sections',
        icon: '═',
        run: (editor, range) => {
          // Trailing empty paragraph so the cursor lands in a text position
          // rather than a NodeSelection on the atom.
          insertBlock(editor, range, [
            { type: 'sectionDivider' },
            { type: 'paragraph' },
          ]);
        },
      },
      {
        id: 'clear',
        label: 'Clear floats',
        description: 'Force content below a floating sidebar',
        icon: '⎚',
        run: (editor, range) => {
          insertBlock(editor, range, [
            { type: 'clear' },
            { type: 'paragraph' },
          ]);
        },
      },
    ],
  },
  {
    section: 'Layout',
    items: [
      {
        id: 'left-sidebar',
        label: 'Left sidebar',
        description: 'Floated sidebar on the left',
        icon: '◧',
        run: (editor, range) => {
          insertBlock(editor, range, blockWithParagraph('leftSidebar'));
        },
      },
      {
        id: 'right-sidebar',
        label: 'Right sidebar',
        description: 'Floated sidebar on the right',
        icon: '◨',
        run: (editor, range) => {
          insertBlock(editor, range, blockWithParagraph('rightSidebar'));
        },
      },
      {
        id: 'columns-2',
        label: '2 columns',
        description: 'Two equal-width columns',
        icon: '▥',
        aliases: ['columns'],
        run: (editor, range) => {
          insertColumns(editor, range, 2);
        },
      },
      {
        id: 'columns-3',
        label: '3 columns',
        description: 'Three equal-width columns',
        icon: '▦',
        run: (editor, range) => {
          insertColumns(editor, range, 3);
        },
      },
      {
        id: 'page-break',
        label: 'Page break',
        description: 'Start a new page',
        icon: '⤓',
        aliases: ['newpage'],
        run: (editor, range) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .command(({ tr, state, dispatch }) => {
              const $from = state.selection.$from;
              let pageDepth = -1;
              for (let d = $from.depth; d > 0; d--) {
                if ($from.node(d).type.name === 'page') { pageDepth = d; break; }
              }
              if (pageDepth < 0) return false;
              const pageType = state.schema.nodes.page;
              const paragraphType = state.schema.nodes.paragraph;
              if (!pageType || !paragraphType) return false;

              // If the slash sat in an empty last-child paragraph of the
              // current page, drop that paragraph so the preceding page
              // doesn't retain a trailing blank line.
              const paraDepth = pageDepth + 1;
              const page = $from.node(pageDepth);
              const inEmptyLastPara =
                $from.depth >= paraDepth &&
                $from.node(paraDepth).type.name === 'paragraph' &&
                $from.node(paraDepth).content.size === 0 &&
                $from.index(pageDepth) === page.childCount - 1 &&
                page.childCount > 1;

              let pageEnd = $from.after(pageDepth);
              if (inEmptyLastPara) {
                const paraStart = $from.before(paraDepth);
                tr.delete(paraStart, pageEnd);
                pageEnd = tr.mapping.map(pageEnd);
              }

              const newPage = pageType.create(null, paragraphType.create());
              if (dispatch) {
                tr.insert(pageEnd, newPage);
                tr.setSelection(TextSelection.near(tr.doc.resolve(pageEnd + 2)));
                dispatch(tr);
              }
              return true;
            })
            .run();
        },
      },
    ],
  },
  {
    section: 'Content blocks',
    items: [
      {
        id: 'info-block',
        label: 'Info block',
        description: 'Dark red callout box',
        icon: 'ⓘ',
        aliases: ['info'],
        run: (editor, range) => {
          insertBlock(editor, range, blockWithParagraph('infoBlock'));
        },
      },
      {
        id: 'rules-block',
        label: 'Rules block',
        description: 'Yellow rules panel',
        icon: '§',
        aliases: ['rules'],
        run: (editor, range) => {
          insertBlock(editor, range, blockWithParagraph('rulesBlock'));
        },
      },
      {
        id: 'note-block',
        label: 'Note block',
        description: 'Beige sidebar note',
        icon: '✎',
        aliases: ['note'],
        run: (editor, range) => {
          insertBlock(editor, range, blockWithParagraph('noteBlock'));
        },
      },
      {
        id: 'math-block',
        label: 'Math block',
        description: 'Formula panel',
        icon: '∑',
        aliases: ['math', 'formula'],
        run: (editor, range) => {
          insertBlock(editor, range, blockWithParagraph('mathBlock'));
        },
      },
      {
        id: 'head-block',
        label: 'Head block',
        description: 'Large display heading panel',
        icon: '✦',
        aliases: ['head'],
        run: (editor, range) => {
          insertBlock(editor, range, blockWithParagraph('headBlock'));
        },
      },
    ],
  },
  {
    section: 'Actions',
    items: [
      {
        id: 'a-single',
        label: 'Single action',
        description: 'One-action symbol',
        icon: ':a:',
        aliases: ['action', 'single'],
        run: (editor, range) => {
          insertInline(editor, range, {
            type: 'actionSymbol',
            attrs: { symbol: ':a:' },
          });
        },
      },
      {
        id: 'a-two',
        label: 'Two actions',
        description: 'Two-action symbol',
        icon: ':aa:',
        aliases: ['double'],
        run: (editor, range) => {
          insertInline(editor, range, {
            type: 'actionSymbol',
            attrs: { symbol: ':aa:' },
          });
        },
      },
      {
        id: 'a-three',
        label: 'Three actions',
        description: 'Three-action symbol',
        icon: ':aaa:',
        aliases: ['triple'],
        run: (editor, range) => {
          insertInline(editor, range, {
            type: 'actionSymbol',
            attrs: { symbol: ':aaa:' },
          });
        },
      },
      {
        id: 'a-reaction',
        label: 'Reaction',
        description: 'Reaction symbol',
        icon: ':r:',
        aliases: ['reaction'],
        run: (editor, range) => {
          insertInline(editor, range, {
            type: 'actionSymbol',
            attrs: { symbol: ':r:' },
          });
        },
      },
      {
        id: 'a-free',
        label: 'Free action',
        description: 'Free-action symbol',
        icon: ':f:',
        aliases: ['free'],
        run: (editor, range) => {
          insertInline(editor, range, {
            type: 'actionSymbol',
            attrs: { symbol: ':f:' },
          });
        },
      },
    ],
  },
];

export function flatCommands(): SlashCommand[] {
  return SLASH_SECTIONS.flatMap((s) => s.items);
}

export function filterCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase().trim();
  if (!q) return flatCommands();
  const scored: { cmd: SlashCommand; score: number }[] = [];
  for (const cmd of flatCommands()) {
    const id = cmd.id.toLowerCase();
    const aliases = (cmd.aliases ?? []).map((a) => a.toLowerCase());
    const label = cmd.label.toLowerCase();
    const desc = cmd.description.toLowerCase();
    let score: number | null = null;
    if (id === q || aliases.includes(q)) score = 0;
    else if (id.startsWith(q) || aliases.some((a) => a.startsWith(q))) score = 1;
    else if (label.startsWith(q)) score = 2;
    else if ([id, label, desc, ...aliases].join(' ').includes(q)) score = 3;
    if (score !== null) scored.push({ cmd, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((x) => x.cmd);
}
