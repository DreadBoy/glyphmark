import type { CSSObject } from '@emotion/react';
import type { SidebarBlockNode, SidebarSegment } from '../parser';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import { Table } from './table';
import { SANS } from '../vendor/font-css';

// The rulebooks' margin/aside lore callouts — e.g. Monster Core's genie
// "SHUYOOKHS" notes or "BASILISK LAIRS". Unlike info()/rule(), these are NOT
// boxed: the whole callout is set in deep maroon ink directly in the margin,
// an ALL-CAPS bold sans title over short sans-serif prose, with no background,
// border, or fill. Colour (maroon vs the body's black) is the differentiator.
//
// In the books the text also aligns toward the spine (right on verso, left on
// recto) beside a thin keyline. That mirroring and the keyline belong with true
// outer-edge placement, which is a follow-up; here the block renders in-flow,
// left-aligned.
const INK = '#481808'; // measured from the source book's sidebar text

export function SidebarBlock({ node }: { node: SidebarBlockNode }) {
  return (
    <div
      className="gm-sidebar"
      css={{
        color: INK,
        breakInside: 'avoid',
        ...tighterMargin(6).withNormalMargin(12),
        ...tighterMargin.marker,
      }}
    >
      {node.content.map((segment, i) => (
        <Segment key={i} segment={segment} />
      ))}
    </div>
  );
}

const PARA_BASE: CSSObject = {
  margin: 0,
  fontFamily: SANS,
  fontSize: pt(8).toRem(),
  lineHeight: pt(11).toRem(),
};

function Segment({ segment }: { segment: SidebarSegment }) {
  if (segment.kind === 'heading') {
    // Both h1 and h2 are ALL-CAPS bold sans titles; h2 is a touch smaller for
    // stacked sub-sections within one margin run.
    return (
      <p
        css={{
          fontFamily: SANS,
          fontWeight: 700,
          textTransform: 'uppercase',
          fontSize: segment.level === 1 ? pt(10).toRem() : pt(9).toRem(),
          lineHeight: pt(12).toRem(),
          ...tighterMargin(10).withNormalMargin(0),
          ...tighterMargin.marker,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'paragraph') {
    // Flush prose — no first-line indent (the lore boxes set their body flush).
    return (
      <p css={{ ...PARA_BASE, ...tighterMargin.marker }}>
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'list') {
    return (
      <ul
        css={{
          ...PARA_BASE,
          paddingLeft: pt(12).toRem(),
          ...tighterMargin.marker,
        }}
      >
        {segment.items.map((item, i) => (
          <li key={i}>{renderInlines(item)}</li>
        ))}
      </ul>
    );
  }

  if (segment.kind === 'table') {
    return <Table node={segment.node} />;
  }

  return null;
}
