import type { Node as PMNode } from '@tiptap/pm/model';
import { Placeholder } from '@tiptap/extensions';

/**
 * Ghost-text hints that teach the creation vocabulary (`/`, `:`, `# `,
 * `**bold**`). Escape/navigation hints live in the status bar, not
 * here, so the placeholder only ever tells the user what they can
 * *start typing*, never what they should press to leave.
 */

function placeholderFor(node: PMNode, containerName: string | null): string {
  if (node.type.name === 'heading') return 'Heading';
  if (node.type.name !== 'paragraph') return '';

  switch (containerName) {
    case 'column':
      return "Column content — '/' for blocks";
    case 'leftSidebar':
    case 'rightSidebar':
      return "Sidebar — '/' for blocks";
    case 'infoBlock':
    case 'rulesBlock':
    case 'noteBlock':
    case 'mathBlock':
    case 'headBlock':
      return "Block body — '/' for more";
    case 'itemBlock':
      return "Body — '/' for blocks, **bold** label for a hang paragraph";
    default:
      return "Press '/' for blocks, ':' for actions, '# ' for a heading";
  }
}

const CONTAINERS = new Set([
  'column',
  'leftSidebar',
  'rightSidebar',
  'infoBlock',
  'rulesBlock',
  'noteBlock',
  'mathBlock',
  'headBlock',
  'itemBlock',
]);

export const Placeholders = Placeholder.configure({
  includeChildren: true,
  showOnlyCurrent: false,
  placeholder: ({ node, editor }) => {
    let container: string | null = null;
    editor.state.doc.descendants((n, pos) => {
      if (n !== node) return true;
      const $pos = editor.state.doc.resolve(pos);
      for (let d = $pos.depth; d > 0; d--) {
        const name = $pos.node(d).type.name;
        if (CONTAINERS.has(name)) {
          container = name;
          break;
        }
      }
      return false;
    });
    return placeholderFor(node, container);
  },
});
