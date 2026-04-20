import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { filterColon } from './commands';
import { colonStore } from './colonStore';

/**
 * Opens an action-symbol dropdown on `:` in any textblock. Works
 * alongside the existing `:a:` / `:aa:` / … input rules — if the user
 * types the full shorthand the rule fires and the menu is dismissed;
 * otherwise the menu gives them a discoverable picker.
 */

export const ColonCommands = Extension.create({
  name: 'colonCommands',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('colonCommands'),

        view: () => ({
          update: (view) => {
            const { open, range } = colonStore.get();
            if (!open || !range) return;
            const sel = view.state.selection;
            const $from = view.state.doc.resolve(range.from);
            if (sel.from < range.from || sel.from > $from.end() + 1) {
              colonStore.reset();
              return;
            }
            // If the range was edited out from under us (e.g. the :a:
            // input rule collapsed it to a node), close.
            const expected = view.state.doc.textBetween(range.from, range.from + 1, null, '');
            if (expected !== ':') {
              colonStore.reset();
              return;
            }
            const afterColon = view.state.doc.textBetween(range.to, sel.from, null, '');
            if (afterColon.includes('\n')) {
              colonStore.reset();
              return;
            }
            const coords = view.coordsAtPos(range.from);
            colonStore.set({
              query: afterColon,
              selectedIdx: Math.min(
                colonStore.get().selectedIdx,
                Math.max(0, filterColon(afterColon).length - 1),
              ),
              rect: { left: coords.left, top: coords.top, bottom: coords.bottom },
            });
          },
        }),

        props: {
          handleKeyDown: (view, event) => {
            const current = colonStore.get();
            if (!current.open) return false;
            const list = filterColon(current.query);
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              colonStore.set({
                selectedIdx:
                  list.length === 0
                    ? 0
                    : Math.min(current.selectedIdx + 1, list.length - 1),
              });
              return true;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              colonStore.set({
                selectedIdx: Math.max(current.selectedIdx - 1, 0),
              });
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              const cmd = list[current.selectedIdx];
              const { editor, range } = current;
              colonStore.reset();
              if (cmd && editor && range) {
                const fullRange = { from: range.from, to: view.state.selection.from };
                cmd.run(editor, fullRange);
              }
              return true;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              colonStore.reset();
              return true;
            }
            return false;
          },

          handleTextInput: (view, from, to, text) => {
            void to;
            if (text !== ':') return false;
            const current = colonStore.get();
            if (current.open) return false;

            const $from = view.state.doc.resolve(from);
            if (!$from.parent.isTextblock) return false;
            // Only trigger on word boundaries so colons inside URLs or
            // timestamps stay as colons.
            const charBefore =
              $from.parentOffset > 0
                ? $from.parent.textBetween($from.parentOffset - 1, $from.parentOffset, null, '')
                : '';
            if (charBefore && !/\s/.test(charBefore)) return false;

            setTimeout(() => {
              const coords = view.coordsAtPos(from);
              colonStore.set({
                open: true,
                query: '',
                selectedIdx: 0,
                rect: { left: coords.left, top: coords.top, bottom: coords.bottom },
                editor: (view as unknown as { editor?: unknown }).editor as never,
                range: { from, to: from + 1 },
              });
            }, 0);
            return false;
          },
        },
      }),
    ];
  },

  onCreate() {
    const view = this.editor.view as unknown as { editor?: unknown };
    view.editor = this.editor;
  },
});
