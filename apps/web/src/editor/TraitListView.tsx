import { useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * Editable chip list for the trait row inside item blocks. The extra
 * input disappears under `@media print` so a printed/PDF rendering is
 * indistinguishable from the static render.
 */

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

export function TraitListView({ node, updateAttributes, editor }: NodeViewProps) {
  const traits: string[] = node.attrs.traits ?? [];
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const pieces = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pieces.length) return;
    updateAttributes({ traits: [...traits, ...pieces] });
    setDraft('');
  };

  const remove = (idx: number) => {
    updateAttributes({ traits: traits.filter((_, i) => i !== idx) });
  };

  return (
    <NodeViewWrapper as="div" className="traits traits-editable" contentEditable={false}>
      <div className="pf-trait pf-trait-edge">{'\u00a0'}</div>
      {traits.map((t, i) => (
        <div
          key={i}
          className={`pf-trait trait-chip ${traitClass(t)}`}
          onClick={() => remove(i)}
          title="Click to remove"
        >
          {t}
        </div>
      ))}
      <input
        className="trait-input"
        value={draft}
        placeholder={traits.length ? '+trait' : 'type traits, comma to add'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === ',' || e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && !draft && traits.length) {
            e.preventDefault();
            remove(traits.length - 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            editor.view.focus();
          }
        }}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
      />
      <div className="pf-trait pf-trait-edge">{'\u00a0'}</div>
    </NodeViewWrapper>
  );
}
