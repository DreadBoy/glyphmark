import type { Editor } from '@tiptap/core';

export type ColonState = {
  open: boolean;
  query: string;
  selectedIdx: number;
  rect: { left: number; top: number; bottom: number } | null;
  editor: Editor | null;
  // Range covers the opening ':' plus anything typed after it so the
  // command that runs can delete it all when it inserts a symbol.
  range: { from: number; to: number } | null;
};

type Listener = (state: ColonState) => void;

const initial: ColonState = {
  open: false,
  query: '',
  selectedIdx: 0,
  rect: null,
  editor: null,
  range: null,
};

let state: ColonState = { ...initial };
const listeners = new Set<Listener>();

export const colonStore = {
  get: () => state,
  set: (partial: Partial<ColonState>) => {
    state = { ...state, ...partial };
    listeners.forEach((l) => l(state));
  },
  reset: () => {
    state = { ...initial };
    listeners.forEach((l) => l(state));
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
