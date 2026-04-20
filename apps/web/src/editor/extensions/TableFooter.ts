import { Node, mergeAttributes } from '@tiptap/core';

export const TableFooter = Node.create({
  name: 'tableFooter',
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.tfoot' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'tfoot' }), 0];
  },
});
