import type { PropsWithChildren } from 'react';

// Class on the wrapper around a run of full-width (`/` … `/`) content.
export const FULL_WIDTH_CLASS = 'gm-full-width';

// A full-width band is a wrapper element spanning both columns, holding the
// band's content as children. It used to be styled through sibling selectors
// keyed off the `/` marker (`.gm-fw-1 ~ *`), but those only hold while the
// content shares a parent with the marker: once paged.js breaks the page, the
// overflow goes into a fresh clone of the document wrapper that no longer
// contains the marker, and the band fell back to two columns (#38). A wrapper
// carries its own `column-span` — paged.js clones it, class and all, onto
// every page the band runs onto.
export function FullWidthBand({ children }: PropsWithChildren) {
  return (
    <div className={FULL_WIDTH_CLASS} css={{ columnSpan: 'all' }}>
      {children}
    </div>
  );
}
