import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react';

interface CommandItem {
  label: string;
  description: string;
  command: (props: { editor: any; range: { from: number; to: number } }) => void;
}

const COMMANDS: CommandItem[] = [
  {
    label: 'Info Block',
    description: 'Red background callout',
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
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'mathBlock',
        content: [{ type: 'paragraph' }],
      }).run();
    },
  },
  {
    label: 'Head Block',
    description: 'Full-width header',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'headBlock',
        content: [{ type: 'heading', attrs: { level: 1 } }],
      }).run();
    },
  },
  {
    label: 'Item Block',
    description: 'PF2e statblock',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertContent({
        type: 'itemBlock',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Item Name' }] },
          { type: 'horizontalRule' },
          { type: 'paragraph' },
        ],
      }).run();
    },
  },
  {
    label: 'Table',
    description: '3x3 table',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    label: 'Horizontal Rule',
    description: 'Separator line',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

interface CommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

interface CommandListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
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
      onKeyDown: (event: KeyboardEvent) => {
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

    return (
      <div className="slash-menu">
        {items.map((item, index) => (
          <button
            key={item.label}
            className={index === selectedIndex ? 'active' : ''}
            onClick={() => selectItem(index)}
          >
            <div>
              <div className="label">{item.label}</div>
              <div className="description">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    );
  },
);
CommandList.displayName = 'CommandList';

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('slashCommands'),
        state: {
          init: () => ({ active: false, range: null as { from: number; to: number } | null, query: '' }),
          apply(tr, prev) {
            const meta = tr.getMeta('slashCommands');
            if (meta) return meta;
            if (tr.docChanged && prev.active) {
              return { active: false, range: null, query: '' };
            }
            return prev;
          },
        },
        props: {
          handleKeyDown(view, event) {
            const state = this.getState(view.state);
            if (!state?.active) {
              if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
                const { $from } = view.state.selection;
                const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
                if (textBefore === '') {
                  // Defer to after the character is inserted
                  setTimeout(() => {
                    const { from } = view.state.selection;
                    view.dispatch(
                      view.state.tr.setMeta('slashCommands', {
                        active: true,
                        range: { from: from - 1, to: from },
                        query: '',
                      }),
                    );
                  });
                }
              }
              return false;
            }
            return false;
          },

          handleTextInput(view, from, to, text) {
            const state = this.getState(view.state);
            if (state?.active && state.range) {
              setTimeout(() => {
                const { $from } = view.state.selection;
                const textInNode = $from.parent.textContent.slice(0, $from.parentOffset);
                const slashIdx = textInNode.lastIndexOf('/');
                if (slashIdx === -1) {
                  view.dispatch(
                    view.state.tr.setMeta('slashCommands', { active: false, range: null, query: '' }),
                  );
                  return;
                }
                const query = textInNode.slice(slashIdx + 1);
                const newFrom = $from.start() + slashIdx;
                view.dispatch(
                  view.state.tr.setMeta('slashCommands', {
                    active: true,
                    range: { from: newFrom, to: $from.pos },
                    query,
                  }),
                );
              });
            }
            return false;
          },

          decorations(state) {
            const pluginState = this.getState(state);
            if (!pluginState?.active || !pluginState.range) return DecorationSet.empty;
            return DecorationSet.empty;
          },
        },

        view() {
          let component: ReactRenderer | null = null;
          let popup: TippyInstance | null = null;
          let currentRange: { from: number; to: number } | null = null;

          return {
            update(view) {
              const pluginState = new PluginKey('slashCommands').getState(view.state) as {
                active: boolean;
                range: { from: number; to: number } | null;
                query: string;
              } | undefined;

              if (!pluginState?.active) {
                if (popup) {
                  popup.destroy();
                  popup = null;
                }
                if (component) {
                  component.destroy();
                  component = null;
                }
                return;
              }

              currentRange = pluginState.range;
              const query = pluginState.query.toLowerCase();
              const filtered = COMMANDS.filter(
                (cmd) =>
                  cmd.label.toLowerCase().includes(query) ||
                  cmd.description.toLowerCase().includes(query),
              );

              if (filtered.length === 0) {
                if (popup) {
                  popup.destroy();
                  popup = null;
                }
                if (component) {
                  component.destroy();
                  component = null;
                }
                return;
              }

              if (!component) {
                component = new ReactRenderer(CommandList, {
                  props: {
                    items: filtered,
                    command: (item: CommandItem) => {
                      if (currentRange) {
                        item.command({ editor, range: currentRange });
                      }
                      if (popup) {
                        popup.destroy();
                        popup = null;
                      }
                      if (component) {
                        component.destroy();
                        component = null;
                      }
                    },
                  },
                  editor,
                });

                const coords = view.coordsAtPos(pluginState.range!.from);
                const virtualEl = {
                  getBoundingClientRect: () =>
                    new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
                };

                popup = tippy(document.body, {
                  getReferenceClientRect: () => virtualEl.getBoundingClientRect(),
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              } else {
                component.updateProps({
                  items: filtered,
                  command: (item: CommandItem) => {
                    if (currentRange) {
                      item.command({ editor, range: currentRange });
                    }
                    if (popup) {
                      popup.destroy();
                      popup = null;
                    }
                    if (component) {
                      component.destroy();
                      component = null;
                    }
                  },
                });
              }
            },

            destroy() {
              if (popup) popup.destroy();
              if (component) component.destroy();
            },
          };
        },
      }),
    ];
  },
});
