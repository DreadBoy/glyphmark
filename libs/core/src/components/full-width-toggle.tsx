import { Global } from '@emotion/react';
import type { BodyNode, FullWidthToggleNode } from '../parser';

export function FullWidthToggle({ node }: { node: FullWidthToggleNode }) {
  return <div className={`gm-fw-${node.index}`} />;
}

// One `column-span: all|none` rule per `/` marker, keyed by the marker's
// 1-based index. Same specificity across rules, so cascade picks the last one
// declared — which is the rule of the most recent preceding marker for any
// given element. Odd index enters full-width, even index leaves it.
export function FullWidthStyles({ body }: { body: BodyNode[] }) {
  const toggles = body.filter((node) => node.type === 'full-width-toggle');
  if (toggles.length === 0) return null;
  const rules = Object.fromEntries(
    toggles.map((_, i) => [
      `.gm-fw-${i + 1} ~ *`,
      { columnSpan: i % 2 === 0 ? ('all' as const) : ('none' as const) },
    ]),
  );
  return <Global styles={rules} />;
}
