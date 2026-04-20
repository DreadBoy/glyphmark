import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';

/**
 * Shows what container the cursor is in and the keys that get out of
 * it. Creation hints (what to type to insert things) live as ghost
 * placeholders inside empty blocks, not here — this bar is strictly
 * about navigation and escape, so it has something to say only when
 * the cursor is somewhere a user might feel trapped.
 */

const CONTAINERS = [
  'itemBlock',
  'leftSidebar',
  'rightSidebar',
  'infoBlock',
  'rulesBlock',
  'noteBlock',
  'mathBlock',
  'headBlock',
  'column',
];

const LABELS: Record<string, string> = {
  itemBlock: 'Item block',
  leftSidebar: 'Left sidebar',
  rightSidebar: 'Right sidebar',
  infoBlock: 'Info block',
  rulesBlock: 'Rules block',
  noteBlock: 'Note block',
  mathBlock: 'Math block',
  headBlock: 'Head block',
  column: 'Column',
};

const ESCAPES: Record<string, string> = {
  column: '↵ ↵ to exit both columns · → to jump to the next column',
  itemBlock: '↵ ↵ to leave the item',
  leftSidebar: '↵ ↵ to leave the sidebar',
  rightSidebar: '↵ ↵ to leave the sidebar',
  infoBlock: '↵ ↵ to leave the block',
  rulesBlock: '↵ ↵ to leave the block',
  noteBlock: '↵ ↵ to leave the block',
  mathBlock: '↵ ↵ to leave the block',
  headBlock: '↵ ↵ to leave the block',
};

function currentContainer(editor: Editor): string | null {
  const $from = editor.state.selection.$from;
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name;
    if (CONTAINERS.includes(name)) return name;
  }
  return null;
}

export function StatusBar({ editor }: { editor: Editor }) {
  const [container, setContainer] = useState<string | null>(() => currentContainer(editor));

  useEffect(() => {
    const update = () => setContainer(currentContainer(editor));
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  if (!container) return null;

  return (
    <div className="editor-statusbar">
      <strong>{LABELS[container]}</strong>
      <span>{ESCAPES[container]}</span>
    </div>
  );
}
