import { Extension } from '@tiptap/core';

export const ParagraphClass = Extension.create({
  name: 'paragraphClass',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          class: {
            default: null as string | null,
            parseHTML: (el) => (el as HTMLElement).getAttribute('class'),
            renderHTML: (attrs) =>
              attrs.class ? { class: attrs.class } : {},
          },
        },
      },
    ];
  },
});
