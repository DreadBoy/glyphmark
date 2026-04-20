import { Extension, InputRule } from '@tiptap/core';

const ACTION_SYMBOLS = [':aaa:', ':aa:', ':a:', ':r:', ':f:'];

// Match any of the symbols at cursor position. Longest-first so `:aa:` wins
// over `:a:`.
const PATTERN = new RegExp(
  `(${ACTION_SYMBOLS.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`,
);

export const ActionSymbolInputRule = Extension.create({
  name: 'actionSymbolInputRule',

  addInputRules() {
    return [
      new InputRule({
        find: PATTERN,
        handler: ({ range, match, chain }) => {
          const symbol = match[0];
          if (!symbol) return null;
          chain()
            .deleteRange(range)
            .insertContentAt(range.from, [
              { type: 'actionSymbol', attrs: { symbol } },
            ])
            .run();
        },
      }),
    ];
  },
});
