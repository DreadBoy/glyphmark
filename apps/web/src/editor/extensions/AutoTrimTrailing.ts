import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Trims trailing empty paragraphs inside containers once the cursor
 * leaves them. Keeps the document in a "screenshotable" state — what
 * you see is what the PDF export (browser print) will produce — while
 * still preserving the empty paragraph that appears under the cursor
 * during editing (otherwise Enter-to-new-paragraph would immediately
 * vanish).
 *
 * Also keeps at least one paragraph per container so nothing becomes
 * empty in a way that violates the schema or the cursor can't enter.
 */
const TRIMMABLE = new Set([
  'page',
  'column',
  'leftSidebar',
  'rightSidebar',
  'infoBlock',
  'rulesBlock',
  'noteBlock',
  'mathBlock',
  'headBlock',
  'itemBlock',
]);

export const AutoTrimTrailing = Extension.create({
  name: 'autoTrimTrailing',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('autoTrimTrailing'),
        appendTransaction: (_trs, _oldState, newState) => {
          const tr = newState.tr;
          let changed = false;
          const selFrom = newState.selection.from;
          newState.doc.descendants((node, pos) => {
            if (!TRIMMABLE.has(node.type.name)) return;
            if (node.childCount <= 1) return;
            const last = node.lastChild;
            if (!last || last.type.name !== 'paragraph' || last.content.size !== 0) return;
            const end = pos + node.nodeSize - 1;
            const paraStart = end - last.nodeSize;
            // Keep the trailing empty paragraph alive while the cursor is
            // inside it — users expect Enter-to-new-paragraph to stick.
            if (selFrom >= paraStart && selFrom <= end) return;
            tr.delete(tr.mapping.map(paraStart), tr.mapping.map(end));
            changed = true;
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});
