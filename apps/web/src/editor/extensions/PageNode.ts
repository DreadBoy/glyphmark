import { Node, mergeAttributes } from '@tiptap/core';

export const PageNode = Node.create({
  name: 'page',
  group: 'page',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.page' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-markdown': '1',
        class: 'bg-paper page d-flex flex-wrap',
      }),
      ['div', { class: 'page-overlay' }],
      [
        'div',
        { 'data-markdown': '1', class: 'flex-even column' },
        0,
      ],
    ];
  },
});
