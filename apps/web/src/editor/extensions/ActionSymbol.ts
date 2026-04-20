import { Node, mergeAttributes } from '@tiptap/core';
import { ACTION_SYMBOLS } from '@glyphmark/core';

type SymbolKey = keyof typeof ACTION_SYMBOLS;

export const ActionSymbol = Node.create({
  name: 'actionSymbol',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      symbol: { default: ':a:' as SymbolKey },
    };
  },

  parseHTML() {
    return [{
      tag: 'img.action-img',
      getAttrs: (el) => {
        const alt = (el as HTMLElement).getAttribute('alt') ?? '';
        return ACTION_SYMBOLS[alt as SymbolKey] ? { symbol: alt } : false;
      },
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const symbol = node.attrs.symbol as SymbolKey;
    const src = ACTION_SYMBOLS[symbol] ?? '';
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        class: 'action-img',
        src,
        alt: symbol,
      }),
    ];
  },
});
