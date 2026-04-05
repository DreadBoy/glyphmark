import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';

function ItemBlockView() {
  return (
    <NodeViewWrapper
      data-markdown="1"
      className="item d-flex flex-wrap"
    >
      <div data-markdown="1" className="flex-even column">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}

export const ItemBlock = Node.create({
  name: 'itemBlock',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div.item' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-markdown': '1',
        class: 'item d-flex flex-wrap',
      }),
      [
        'div',
        { 'data-markdown': '1', class: 'flex-even column' },
        0,
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ItemBlockView);
  },
});
