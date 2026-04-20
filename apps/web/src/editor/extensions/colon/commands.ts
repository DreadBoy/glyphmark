import type { Editor, Range } from '@tiptap/core';

export type ColonCommand = {
  id: string;
  symbol: string;
  label: string;
  description: string;
  run: (editor: Editor, range: Range) => void;
};

function insertSymbol(symbol: string) {
  return (editor: Editor, range: Range) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({ type: 'actionSymbol', attrs: { symbol } })
      .run();
  };
}

export const COLON_COMMANDS: ColonCommand[] = [
  { id: 'a', symbol: ':a:', label: 'Single action', description: 'One-action', run: insertSymbol(':a:') },
  { id: 'aa', symbol: ':aa:', label: 'Two actions', description: 'Two-action', run: insertSymbol(':aa:') },
  { id: 'aaa', symbol: ':aaa:', label: 'Three actions', description: 'Three-action', run: insertSymbol(':aaa:') },
  { id: 'r', symbol: ':r:', label: 'Reaction', description: 'Reaction', run: insertSymbol(':r:') },
  { id: 'f', symbol: ':f:', label: 'Free action', description: 'Free action', run: insertSymbol(':f:') },
];

export function filterColon(query: string): ColonCommand[] {
  const q = query.toLowerCase().trim().replace(/:$/, '');
  if (!q) return COLON_COMMANDS;
  return COLON_COMMANDS.filter((c) => c.id.startsWith(q) || c.label.toLowerCase().includes(q));
}
