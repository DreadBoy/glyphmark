import type { Editor, Range } from '@tiptap/core';

export type SlashState = {
  open: boolean;
  query: string;
  selectedIdx: number;
  rect: { left: number; top: number; bottom: number } | null;
  editor: Editor | null;
  range: Range | null;
};

type Listener = (state: SlashState) => void;

const initial: SlashState = {
  open: false,
  query: '',
  selectedIdx: 0,
  rect: null,
  editor: null,
  range: null,
};

let state: SlashState = initial;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn(state);
}

export const slashStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  get(): SlashState {
    return state;
  },
  set(patch: Partial<SlashState>) {
    state = { ...state, ...patch };
    emit();
  },
  reset() {
    state = { ...initial };
    emit();
  },
};
