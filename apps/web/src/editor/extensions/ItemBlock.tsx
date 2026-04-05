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
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-markdown': '1',
        class: 'item d-flex flex-wrap',
      }),
      [
        'div',
        { 'data-markdown': '1', class: 'flex-even column' },
        0,
      ],
    ];
  },
});
