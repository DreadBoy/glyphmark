import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Core renders paragraphs that start with a **bold** prefix as
 * `<p class="hang">` so wrapped lines indent past the bold label. Mirror
 * that rule in the editor so the class is derived from content, not set
 * manually by the user.
 */
export const AutoHang = Extension.create({
  name: 'autoHang',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoHang'),
        appendTransaction: (_trs, _oldState, newState) => {
          const tr = newState.tr;
          let changed = false;
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== 'paragraph') return;
            const firstChild = node.firstChild;
            const boldType = newState.schema.marks.bold;
            const startsBold =
              firstChild &&
              firstChild.isText &&
              boldType &&
              firstChild.marks.some((m) => m.type === boldType);
            const want = startsBold ? 'hang' : null;
            if ((node.attrs.class ?? null) !== want) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                class: want,
              });
              changed = true;
            }
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});
