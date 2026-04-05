import { Node, mergeAttributes } from '@tiptap/core';
import { ACTION_SYMBOLS } from '@glyphmark/core';

const TYPE_TO_KEY: Record<string, string> = {
  'action': ':a:',
  'two-actions': ':aa:',
  'three-actions': ':aaa:',
  'reaction': ':r:',
  'free-action': ':f:',
};

export const ActionSymbol = Node.create({
  name: 'actionSymbol',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      type: { default: 'action' },
    };
  },

  parseHTML() {
    return [{
      tag: 'img.text-img',
      getAttrs: (el) => {
        const src = (el as HTMLImageElement).src;
        for (const [type, key] of Object.entries(TYPE_TO_KEY)) {
          if (ACTION_SYMBOLS[key] === src) {
            return { type };
          }
        }
        return { type: 'action' };
      },
    }];
  },

  renderHTML({ node }) {
    const key = TYPE_TO_KEY[node.attrs.type] || ':a:';
    const src = ACTION_SYMBOLS[key] || ACTION_SYMBOLS[':a:'];
    return ['img', mergeAttributes({ src, class: 'text-img' })];
  },
});
