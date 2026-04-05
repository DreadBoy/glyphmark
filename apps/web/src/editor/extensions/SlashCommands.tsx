import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, {
  type SuggestionOptions,
  type SuggestionProps,
  type SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react';

// ── Types ──

interface CommandItem {
  label: string;
  description: string;
  icon: string;
  section?: string;
  command: (props: { editor: any; range: { from: number; to: number } }) => void;
}

// ── Command definitions ──

const COMMANDS: CommandItem[] = [
  // ── Basic Blocks ──
  {
    label: 'Text',
    description: 'Plain paragraph',
    icon: 'T',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    label: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    label: 'Numbered List',
    description: 'Ordered list',
    icon: '1.',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    label: 'Divider',
    description: 'Horizontal rule',
    icon: '—',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    label: 'Table',
    description: '3×3 table with header',
    icon: '⊞',
    section: 'Basic Blocks',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },

  // ── Layout ──
  {
    label: 'Head Block',
    description: 'Full-width display header',
    icon: '▣',
    section: 'Layout',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'headBlock',
        content: [{ type: 'heading', attrs: { level: 1 } }],
      }).run();
    },
  },

  // ── PF2e Blocks ──
  {
    label: 'Info Block',
    description: 'Red background callout',
    icon: '!',
    section: 'PF2e Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'infoBlock',
        content: [{ type: 'paragraph' }],
      }).run();
    },
  },
  {
    label: 'Note Block',
    description: 'Tan background note',
    icon: '✎',
    section: 'PF2e Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'noteBlock',
        content: [{ type: 'paragraph' }],
      }).run();
    },
  },
  {
    label: 'Rules Block',
    description: 'Cream background rules',
    icon: '§',
    section: 'PF2e Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'rulesBlock',
        content: [{ type: 'paragraph' }],
      }).run();
    },
  },
  {
    label: 'Math Block',
    description: 'Bordered math area',
    icon: '∑',
    section: 'PF2e Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'mathBlock',
        content: [{ type: 'paragraph' }],
      }).run();
    },
  },
  {
    label: 'Item Block',
    description: 'PF2e statblock',
    icon: '◆',
    section: 'PF2e Blocks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'itemBlock',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Item Name' }],
          },
          { type: 'horizontalRule' },
          { type: 'paragraph' },
        ],
      }).run();
    },
  },
];

// ── Group commands by section for rendering ──

function groupBySection(
  items: CommandItem[],
): { section: string; items: CommandItem[] }[] {
  const groups: { section: string; items: CommandItem[] }[] = [];
  let current: { section: string; items: CommandItem[] } | null = null;

  for (const item of items) {
    const section = item.section || 'Other';
    if (!current || current.section !== section) {
      current = { section, items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

// ── React popup component ──

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

interface CommandListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const CommandList = forwardRef<CommandListHandle, CommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    const groups = groupBySection(items);
    let flatIdx = 0;

    return (
      <div className="slash-menu">
        {groups.map((group) => (
          <div key={group.section}>
            <div className="slash-section">{group.section}</div>
            {group.items.map((item) => {
              const idx = flatIdx++;
              return (
                <button
                  key={item.label}
                  className={idx === selectedIndex ? 'active' : ''}
                  onClick={() => selectItem(idx)}
                >
                  <span className="slash-icon">{item.icon}</span>
                  <div>
                    <div className="label">{item.label}</div>
                    <div className="description">{item.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  },
);
CommandList.displayName = 'CommandList';

// ── Suggestion render callbacks (tippy popup) ──

function suggestionRender(): ReturnType<
  NonNullable<SuggestionOptions<CommandItem>['render']>
> {
  let component: ReactRenderer<CommandListHandle> | null = null;
  let popup: TippyInstance | null = null;

  const getRect = (props: SuggestionProps<CommandItem>) =>
    props.clientRect
      ? () => props.clientRect!() ?? new DOMRect()
      : () => new DOMRect();

  return {
    onStart(props: SuggestionProps<CommandItem>) {
      component = new ReactRenderer(CommandList, {
        props: { items: props.items, command: props.command },
        editor: props.editor,
      });

      popup = tippy(document.body, {
        getReferenceClientRect: getRect(props),
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: 'manual',
        placement: 'bottom-start',
      });
    },

    onUpdate(props: SuggestionProps<CommandItem>) {
      component?.updateProps({
        items: props.items,
        command: props.command,
      });
      popup?.setProps({
        getReferenceClientRect: getRect(props),
      });
    },

    onKeyDown(props: SuggestionKeyDownProps) {
      if (props.event.key === 'Escape') {
        popup?.hide();
        return true;
      }
      return component?.ref?.onKeyDown(props) ?? false;
    },

    onExit() {
      popup?.destroy();
      component?.destroy();
      popup = null;
      component = null;
    },
  };
}

// ── Extension ──

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: new PluginKey('slashCommands'),
        startOfLine: true,

        command: ({
          editor,
          range,
          props: item,
        }: {
          editor: any;
          range: { from: number; to: number };
          props: CommandItem;
        }) => {
          item.command({ editor, range });
        },

        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return COMMANDS.filter(
            (cmd) =>
              cmd.label.toLowerCase().includes(q) ||
              cmd.description.toLowerCase().includes(q),
          );
        },

        render: suggestionRender,
      } satisfies Omit<SuggestionOptions<CommandItem, CommandItem>, 'editor'>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
