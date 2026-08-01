import { pt } from './size-helper';
import type { AnchorAttrs } from '../renderer/source-anchors';

// Extra props are the source-anchor attributes (`data-glyph-line`), passed by
// callers that render an `hr` from a node with an origin. The unadorned `<Hr />`
// under an item heading is renderer-invented and has none.
export function Hr(props: AnchorAttrs) {
  return (
    <hr
      {...props}
      css={{
        marginBlock: `${pt(1.5).toRem()} ${pt(1.5).toRem()}`,
        border: 0,
        borderTop: `${pt(0.5).toRem()} solid #000d`,
        borderBottom: `${pt(0.5).toRem()} solid #0002`,
        breakAfter: 'avoid',
      }}
    />
  );
}
