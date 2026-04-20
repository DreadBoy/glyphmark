import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  SLASH_SECTIONS,
  filterCommands,
  type SlashCommand,
} from './extensions/slash/commands';
import { slashStore, type SlashState } from './extensions/slash/slashStore';

const MENU_WIDTH = 280;
const MENU_MAX_HEIGHT = 360;
const MENU_GAP = 6;

export function SlashMenu() {
  const [state, setState] = useState<SlashState>(slashStore.get());
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => slashStore.subscribe(setState), []);

  useLayoutEffect(() => {
    if (!state.open || !state.rect) return;
    const el = menuRef.current;
    if (!el) return;
    const selected = el.querySelector('[data-selected="true"]');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }, [state]);

  if (!state.open || !state.rect) return null;

  const filtered = filterCommands(state.query);
  const sections = state.query
    ? [{ section: 'Results', items: filtered }]
    : SLASH_SECTIONS;

  if (filtered.length === 0) return null;

  // Position: prefer below the cursor. Flip above if it would overflow.
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  let left = state.rect.left;
  let top = state.rect.bottom + MENU_GAP;
  if (left + MENU_WIDTH > viewportW - 8) left = viewportW - MENU_WIDTH - 8;
  if (top + MENU_MAX_HEIGHT > viewportH - 8) {
    top = state.rect.top - MENU_MAX_HEIGHT - MENU_GAP;
  }
  if (top < 8) top = 8;

  let flatIdx = 0;

  return (
    <div
      ref={menuRef}
      className="slash-menu"
      style={{
        position: 'fixed',
        left,
        top,
        width: MENU_WIDTH,
        maxHeight: MENU_MAX_HEIGHT,
      }}
    >
      {sections.map((section) => {
        const items = section.items.filter((cmd) =>
          filtered.some((f) => f.id === cmd.id),
        );
        if (items.length === 0) return null;
        return (
          <div key={section.section}>
            <div className="slash-menu-section">{section.section}</div>
            {items.map((cmd) => {
              const idx = flatIdx++;
              const isSelected = idx === state.selectedIdx;
              return (
                <button
                  key={cmd.id}
                  type="button"
                  data-selected={isSelected}
                  className={`slash-menu-item${isSelected ? ' is-selected' : ''}`}
                  onMouseEnter={() => slashStore.set({ selectedIdx: idx })}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    runCommand(cmd);
                  }}
                >
                  <span className="slash-menu-icon">{cmd.icon}</span>
                  <span className="slash-menu-label">
                    <strong>{cmd.label}</strong>
                    <span>{cmd.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function runCommand(cmd: SlashCommand) {
  const { editor, range } = slashStore.get();
  slashStore.reset();
  if (!editor || !range) return;
  const head = editor.state.selection.from;
  cmd.run(editor, { from: range.from, to: Math.max(head, range.to) });
}
