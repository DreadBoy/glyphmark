import type { PropsWithChildren } from 'react';
import { Global } from '@emotion/react';
import { BASE_PT, pt } from './size-helper';

export const MARGIN = 72;
export const COLUMN_GAP = 14;
// A4 content height: 297mm − 2×72pt margins ≈ 698pt. A hair under so a
// full-height sidebar rail never spills a near-empty second page.
export const PAGE_CONTENT_HEIGHT = 697;

// Page-level globals (page size/margins, root font size, resets). Shared by the
// default two-column layout and the sidebar-rail layout so the two stay in sync.
// Rendered via <Global>, so it emits no body DOM — only injected styles.
export function PageGlobals() {
  return (
    <Global
      styles={{
        '*': {
          boxSizing: 'border-box',
        },
        ':root': {
          fontSize: pt(BASE_PT).toPt(),
          lineHeight: 1,
        },
        '@page': {
          size: 'A4',
          margin: pt(MARGIN).toRem(),
        },
        body: {
          margin: 0,
        },
      }}
    />
  );
}

export function Document({ children }: PropsWithChildren) {
  return (
    <div
      css={{
        columnCount: 2,
        columnGap: pt(COLUMN_GAP).toRem(),
      }}
    >
      <PageGlobals />
      {children}
    </div>
  );
}
