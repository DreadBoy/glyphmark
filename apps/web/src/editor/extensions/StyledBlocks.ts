import { Node, mergeAttributes } from '@tiptap/core';

type BlockSpec = {
  name: string;
  cssClass: string;
};

function styledBlock({ name, cssClass }: BlockSpec) {
  return Node.create({
    name,
    group: 'block',
    content: 'block+',
    defining: true,

    parseHTML() {
      return [{ tag: `div.${cssClass}` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, { class: cssClass }),
        0,
      ];
    },
  });
}

export const HeadBlock = styledBlock({ name: 'headBlock', cssClass: 'head' });
export const InfoBlock = styledBlock({ name: 'infoBlock', cssClass: 'info' });
export const RulesBlock = styledBlock({ name: 'rulesBlock', cssClass: 'rules' });
export const NoteBlock = styledBlock({ name: 'noteBlock', cssClass: 'note' });
export const MathBlock = styledBlock({ name: 'mathBlock', cssClass: 'math' });
export const LeftSidebar = styledBlock({ name: 'leftSidebar', cssClass: 'left' });
export const RightSidebar = styledBlock({ name: 'rightSidebar', cssClass: 'right' });
