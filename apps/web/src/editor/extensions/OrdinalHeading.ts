import { Node, mergeAttributes } from '@tiptap/core';

export const OrdinalHeading = Node.create({
  name: 'ordinalHeading',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      text: { default: '' },
      ordinal: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div.ordinal' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'ordinal' }),
      ['h2', {}, node.attrs.text as string],
      ['h2', {}, node.attrs.ordinal as string],
    ];
  },
});
