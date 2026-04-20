import { Node, mergeAttributes } from '@tiptap/core';

export const ItemBlock = Node.create({
  name: 'itemBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.item' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'item' }), 0];
  },
});
