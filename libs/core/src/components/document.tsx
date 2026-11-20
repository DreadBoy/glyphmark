import type { PropsWithChildren } from 'react';
import { Global } from '@emotion/react';
import { BASE_PT, pt } from './size-helper';

export function Document({ children }: PropsWithChildren) {
  return (
    <div
      className={DOCUMENT_CLASS}
      css={{
        columnCount: 2,
        columnGap: pt(COLUMN_GAP).toRem(),
      }}
    >
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
      {children}
    </div>
  );
}

export const MARGIN = 72;
export const COLUMN_GAP = 14;
// Marker class on the document wrapper. paged.js clones the wrapper onto every
// page, so per-page overrides (the sidebar page layout) can target that page's
// fragment of it.
export const DOCUMENT_CLASS = 'gm-document';
