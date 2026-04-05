import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Factory for creating styled block extensions (info, note, rules, math, head).
 * Each renders as:
 *   <div class="{cssClass} d-flex flex-wrap [extraClasses]">
 *     <div class="flex-even column">
 *       {editable content}
 *     </div>
 *   </div>
 */
export function createStyledBlock(config: {
  name: string;
  cssClass: string;
  extraClasses?: string;
}) {
  const outerClasses = [config.cssClass, 'd-flex', 'flex-wrap', config.extraClasses]
    .filter(Boolean)
    .join(' ');

  return Node.create({
    name: config.name,
    group: 'block',
    content: 'block+',
    defining: true,

    parseHTML() {
      return [{ tag: `div.${config.cssClass}` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        'div',
        mergeAttributes(HTMLAttributes, {
          'data-markdown': '1',
          class: outerClasses,
        }),
        [
          'div',
          { 'data-markdown': '1', class: 'flex-even column' },
          0, // content hole
        ],
      ];
    },
  });
}

export const InfoBlock = createStyledBlock({
  name: 'infoBlock',
  cssClass: 'info',
});

export const NoteBlock = createStyledBlock({
  name: 'noteBlock',
  cssClass: 'note',
});

export const RulesBlock = createStyledBlock({
  name: 'rulesBlock',
  cssClass: 'rules',
});

export const MathBlock = createStyledBlock({
  name: 'mathBlock',
  cssClass: 'math',
});

export const HeadBlock = createStyledBlock({
  name: 'headBlock',
  cssClass: 'head',
  extraClasses: 'w-100',
});

export const LeftSidebar = createStyledBlock({
  name: 'leftSidebar',
  cssClass: 'left',
});

export const RightSidebar = createStyledBlock({
  name: 'rightSidebar',
  cssClass: 'right',
});
