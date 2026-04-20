import { Node, mergeAttributes } from '@tiptap/core';

export const SectionDivider = Node.create({
  name: 'sectionDivider',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'hr.section-divider' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes, { class: 'section-divider' })];
  },
});

export const Clear = Node.create({
  name: 'clear',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'div.clear' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'clear' })];
  },
});
