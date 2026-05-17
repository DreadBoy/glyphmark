import type { PropsWithChildren } from 'react';
import { Global } from '@emotion/react';
import { BASE_PT, pt } from './size-helper';

export function Document({ children }: PropsWithChildren) {
  return (
    <div
      css={{
        columnCount: 2,
        columnGap: pt(14).toRem(),
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
