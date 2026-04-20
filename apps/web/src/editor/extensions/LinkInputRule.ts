import { Extension } from '@tiptap/core';
import { InputRule } from '@tiptap/core';

const LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)$/;

export const LinkInputRule = Extension.create({
  name: 'linkInputRule',

  addInputRules() {
    return [
      new InputRule({
        find: LINK_PATTERN,
        handler: ({ range, match, chain }) => {
          const [, label, href] = match;
          if (!label || !href) return null;
          chain()
            .deleteRange(range)
            .insertContentAt(range.from, [
              {
                type: 'text',
                marks: [{ type: 'link', attrs: { href } }],
                text: label,
              },
            ])
            // Clear stored marks so the next typed character isn't
            // extended with the link mark we just inserted.
            .command(({ tr }) => {
              tr.setStoredMarks([]);
              return true;
            })
            .run();
        },
      }),
    ];
  },
});
