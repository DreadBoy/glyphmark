import { Node } from '@tiptap/core';

export const DocNode = Node.create({
  name: 'doc',
  topNode: true,
  content: 'page+',
});
