import { Node, mergeAttributes } from '@tiptap/core';

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,}',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.columns' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'columns' }),
      0,
    ];
  },
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.column' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'column' }),
      0,
    ];
  },
});
