import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Trait list node for PF2e item blocks.
 * Renders as a row of colored trait badges.
 */
export const TraitList = Node.create({
  name: 'traitList',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      traits: {
        default: [],
        parseHTML: (element) => {
          const traits: string[] = [];
          element.querySelectorAll('.pf-trait:not(.pf-trait-edge)').forEach((el) => {
            const text = el.textContent?.trim();
            if (text) traits.push(text);
          });
          return traits;
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.traits' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const traits: string[] = node.attrs.traits || [];
    if (traits.length === 0) {
      return ['div', mergeAttributes(HTMLAttributes, { class: 'traits' })];
    }

    const children: (string | Record<string, unknown> | (string | Record<string, unknown>)[])[] = [
      ['div', { class: 'pf-trait pf-trait-edge' }, '\u00a0'],
    ];

    for (const trait of traits) {
      const traitClass = getTraitClass(trait);
      children.push(['div', { class: `pf-trait${traitClass}` }, trait]);
    }

    children.push(['div', { class: 'pf-trait pf-trait-edge' }, '\u00a0']);

    return ['div', mergeAttributes(HTMLAttributes, { class: 'traits' }), ...children];
  },
});

function getTraitClass(trait: string): string {
  const t = trait.toLowerCase().trim();
  if (t === 'uncommon') return ' pf-trait-uncommon';
  if (t === 'rare') return ' pf-trait-rare';
  if (t === 'unique') return ' pf-trait-unique';
  const sizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
  if (sizes.includes(t)) return ' pf-trait-size';
  const aligns = [
    'lg', 'ln', 'le', 'ng', 'n', 'ne', 'cg', 'cn', 'ce',
    'lawful good', 'lawful neutral', 'lawful evil',
    'neutral good', 'neutral', 'neutral evil',
    'chaotic good', 'chaotic neutral', 'chaotic evil',
  ];
  if (aligns.includes(t)) return ' pf-trait-align';
  return ` pf-trait-${t.replace(/\s+/g, '-')}`;
}
