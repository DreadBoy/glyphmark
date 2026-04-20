import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TraitListView } from '../TraitListView';

const SIZES = new Set(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);
const ALIGNS = new Set([
  'lg', 'ln', 'le', 'ng', 'n', 'ne', 'cg', 'cn', 'ce',
  'lawful good', 'lawful neutral', 'lawful evil',
  'neutral good', 'neutral', 'neutral evil',
  'chaotic good', 'chaotic neutral', 'chaotic evil',
]);

function traitClass(trait: string): string {
  const t = trait.toLowerCase().trim();
  if (t === 'uncommon') return 'pf-trait-uncommon';
  if (t === 'rare') return 'pf-trait-rare';
  if (t === 'unique') return 'pf-trait-unique';
  if (SIZES.has(t)) return 'pf-trait-size';
  if (ALIGNS.has(t)) return 'pf-trait-align';
  return `pf-trait-${t.replace(/\s+/g, '-')}`;
}

export const TraitList = Node.create({
  name: 'traitList',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      traits: { default: [] as string[] },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TraitListView);
  },

  parseHTML() {
    return [{ tag: 'div.traits' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const raw = (node.attrs.traits ?? []) as string[];
    const children: unknown[] = [];
    children.push(['div', { class: 'pf-trait pf-trait-edge' }, '\u00a0']);
    for (const t of raw) {
      children.push(['div', { class: `pf-trait ${traitClass(t)}` }, t]);
    }
    children.push(['div', { class: 'pf-trait pf-trait-edge' }, '\u00a0']);
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'traits' }),
      ...children,
    ];
  },
});
