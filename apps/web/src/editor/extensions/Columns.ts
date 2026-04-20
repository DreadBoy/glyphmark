import { Node, mergeAttributes } from '@tiptap/core';

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  // Exactly two columns — the product only supports a two-column layout.
  // Fixing to {2} also prevents ProseMirror's joinBackward from wrapping
  // a trailing empty paragraph into a new third column when the user
  // presses Backspace on a block right after a columns block.
  content: 'column{2}',
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
