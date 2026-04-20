import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const PageDecorations = Extension.create({
  name: 'pageDecorations',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pageDecorations'),
        props: {
          decorations(state) {
            const widgets: Decoration[] = [];

            state.doc.forEach((pageNode, pageOffset) => {
              if (pageNode.type.name !== 'page') return;
              const attrs = pageNode.attrs as {
                title?: string | null;
                watermark?: string | null;
              };
              const endPos = pageOffset + pageNode.nodeSize - 1;

              if (attrs.watermark) {
                const watermark = attrs.watermark;
                widgets.push(
                  Decoration.widget(endPos, () => {
                    const el = document.createElement('div');
                    el.className = 'watermark';
                    el.textContent = watermark;
                    return el;
                  }, { side: 1, key: `watermark:${watermark}` }),
                );
              }

              if (attrs.title) {
                const title = attrs.title;
                widgets.push(
                  Decoration.widget(endPos, () => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'title';
                    const h1 = document.createElement('h1');
                    h1.textContent = title;
                    wrapper.appendChild(h1);
                    return wrapper;
                  }, { side: 1, key: `title:${title}` }),
                );
              }

              widgets.push(
                Decoration.widget(endPos, () => {
                  const el = document.createElement('div');
                  el.className = 'page-overlay';
                  return el;
                }, { side: 1, key: 'page-overlay' }),
              );
            });

            return DecorationSet.create(state.doc, widgets);
          },
        },
      }),
    ];
  },
});
