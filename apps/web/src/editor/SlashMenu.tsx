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
    const selected = el.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (!selected) return;
    // Adjust the menu's own scrollTop instead of calling scrollIntoView.
    // scrollIntoView also touches ancestor scrollers (including the window
    // when the menu is position: fixed near the edge of the page), which
    // caused the caller's viewport to judder when navigating across the
    // wrap boundary.
    //
    // When the selected button is the first entry of its section, use
    // the section div's top so the section header ("BASIC", "DIVIDERS",
    // etc.) is also in view — otherwise wrapping to idx 0 leaves the
    // label just above the visible area.
    const section = selected.parentElement;
    const firstButton = section?.querySelector('button');
    const topAnchor =
      firstButton === selected && section ? section : selected;
    const menuRect = el.getBoundingClientRect();
    const topRect = topAnchor.getBoundingClientRect();
    const botRect = selected.getBoundingClientRect();
    if (topRect.top < menuRect.top) {
      el.scrollTop -= menuRect.top - topRect.top;
    } else if (botRect.bottom > menuRect.bottom) {
      el.scrollTop += botRect.bottom - menuRect.bottom;
    }
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
