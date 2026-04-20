import { Node, mergeAttributes } from '@tiptap/core';

export const PageNode = Node.create({
  name: 'page',
  group: 'page',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      title: { default: null },
      watermark: { default: null },
      pageNumbers: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div.page' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { title, watermark, pageNumbers, ...rest } = HTMLAttributes as Record<string, unknown>;
    return [
      'div',
      mergeAttributes(rest, { class: 'page' }),
      0,
    ];
  },
});
