import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  filterColon,
  type ColonCommand,
} from './extensions/colon/commands';
import { colonStore, type ColonState } from './extensions/colon/colonStore';

const MENU_WIDTH = 220;
const MENU_MAX_HEIGHT = 280;
const MENU_GAP = 6;

export function ColonMenu() {
  const [state, setState] = useState<ColonState>(colonStore.get());
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => colonStore.subscribe(setState), []);

  useLayoutEffect(() => {
    if (!state.open || !state.rect) return;
    const el = menuRef.current;
    if (!el) return;
    const selected = el.querySelector('[data-selected="true"]');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [state]);

  if (!state.open || !state.rect) return null;
  const filtered = filterColon(state.query);
  if (filtered.length === 0) return null;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let left = state.rect.left;
  let top = state.rect.bottom + MENU_GAP;
  if (left + MENU_WIDTH > viewportW - 8) left = viewportW - MENU_WIDTH - 8;
  if (top + MENU_MAX_HEIGHT > viewportH - 8) {
    top = state.rect.top - MENU_MAX_HEIGHT - MENU_GAP;
  }
  if (top < 8) top = 8;

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{ position: 'fixed', left, top, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
    >
      <div className="slash-menu-section">Action symbols</div>
      {filtered.map((cmd, idx) => {
        const isSelected = idx === state.selectedIdx;
        return (
          <button
            key={cmd.id}
            type="button"
            data-selected={isSelected}
            className={`slash-menu-item${isSelected ? ' is-selected' : ''}`}
            onMouseEnter={() => colonStore.set({ selectedIdx: idx })}
            onMouseDown={(e) => {
              e.preventDefault();
              runCommand(cmd);
            }}
          >
            <span className="slash-menu-icon">{cmd.symbol}</span>
            <span className="slash-menu-label">
              <strong>{cmd.label}</strong>
              <span>{cmd.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function runCommand(cmd: ColonCommand) {
  const { editor, range } = colonStore.get();
  colonStore.reset();
  if (!editor || !range) return;
  const head = editor.state.selection.from;
  cmd.run(editor, { from: range.from, to: Math.max(head, range.to) });
}
