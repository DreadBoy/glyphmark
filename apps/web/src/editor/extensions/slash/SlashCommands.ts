import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { filterCommands } from './commands';
import { slashStore } from './slashStore';

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('slashCommands'),

        view: () => ({
          update: (view) => {
            const { open, range } = slashStore.get();
            if (!open || !range) return;
            // Update query + position based on current selection
            const $from = view.state.doc.resolve(range.from);
            const parentStart = $from.start();
            const textBefore = $from.parent.textBetween(
              0,
              $from.parentOffset,
              null,
              '\ufffc',
            );
            // The '/' is one char before range.to (we tracked where it is).
            // Anything after the '/' up to current selection head is the query.
            const sel = view.state.selection;
            if (sel.from < range.from || sel.from > $from.end() + 1) {
              slashStore.reset();
              return;
            }
            const afterSlash = view.state.doc.textBetween(
              range.to,
              sel.from,
              null,
              '',
            );
            // If another newline / block boundary happened, close.
            if (afterSlash.includes('\n')) {
              slashStore.reset();
              return;
            }
            const query = afterSlash;
            const coords = view.coordsAtPos(range.from);
            slashStore.set({
              query,
              selectedIdx: Math.min(
                slashStore.get().selectedIdx,
                Math.max(0, filterCommands(query).length - 1),
              ),
              rect: {
                left: coords.left,
                top: coords.top,
                bottom: coords.bottom,
              },
            });
            // Unused but referenced for type completeness
            void parentStart;
            void textBefore;
          },
        }),

        props: {
          handleKeyDown: (view, event) => {
            const current = slashStore.get();
            if (!current.open) return false;

            const list = filterCommands(current.query);
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              slashStore.set({
                selectedIdx:
                  list.length === 0
                    ? 0
                    : (current.selectedIdx + 1) % list.length,
              });
              return true;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              slashStore.set({
                selectedIdx:
                  list.length === 0
                    ? 0
                    : (current.selectedIdx - 1 + list.length) % list.length,
              });
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault();
              const cmd = list[current.selectedIdx];
              const { editor, range } = current;
              slashStore.reset();
              if (cmd && editor && range) {
                // Extend range to include anything typed after the slash.
                const fullRange = { from: range.from, to: view.state.selection.from };
                cmd.run(editor, fullRange);
              }
              return true;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              slashStore.reset();
              return true;
            }
            return false;
          },

          handleTextInput: (view, from, to, text) => {
            void to;
            const current = slashStore.get();
            if (current.open) return false;
            if (text !== '/') return false;

            const $from = view.state.doc.resolve(from);
            const parent = $from.parent;
            // Slash is for block-level commands. Inline inserts (action
            // symbols) have their own input rules (:a:, :aa:, …).
            if (parent.type.name !== 'paragraph') return false;
            // Only trigger in an empty/whitespace paragraph so slashes in
            // prose stay as slashes.
            const before = parent.textBetween(0, $from.parentOffset, null, '');
            if (before.trim() !== '') return false;

            // Defer so the '/' character actually lands before we read coords.
            setTimeout(() => {
              const coords = view.coordsAtPos(from);
              slashStore.set({
                open: true,
                query: '',
                selectedIdx: 0,
                rect: {
                  left: coords.left,
                  top: coords.top,
                  bottom: coords.bottom,
                },
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
    // Give the plugin a reference to the Editor so commands can run.
    const view = this.editor.view as unknown as { editor?: unknown };
    view.editor = this.editor;
  },
});
