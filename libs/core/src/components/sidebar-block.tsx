import type { CSSObject } from '@emotion/react';
import type { PropsWithChildren } from 'react';
import type { SidebarBlockNode, SidebarSegment } from '../parser';
import { pt } from './size-helper';
import { COLUMN_GAP } from './document';
import { renderInlines } from './inline';
import { Table } from './table';
import { SANS } from '../vendor/font-css';

// The rulebooks' margin/aside lore callouts — e.g. Monster Core's genie
// "SHUYOOKHS" notes or "BASILISK LAIRS". A true sidebar: a narrow, full-height
// rail set against one edge, separated from the main text by a keyline, with the
// whole callout in deep maroon ink (an ALL-CAPS bold sans title over short
// sans-serif prose). No box/fill — colour is what sets it apart from the black
// body text. The rail stays full height even when its content is short.
//
// The rail (SidebarRail) is the chrome; each SidebarBlock is one callout's
// content, and consecutive sidebars stack inside the same rail. SidebarLayout in
// the renderer places the rail (right edge for now — recto/verso alternation is
// a follow-up).
const INK = '#481808'; // measured from the source book's sidebar text
const KEYLINE = '#191000';
const RAIL_WIDTH = 120; // pt — narrower than a main text column

export function SidebarRail({ children }: PropsWithChildren) {
  return (
    <div
      css={{
        width: pt(RAIL_WIDTH).toRem(),
        flexShrink: 0,
        alignSelf: 'stretch', // fill the flex row so the keyline runs full height
        marginLeft: pt(COLUMN_GAP).toRem(),
        paddingLeft: pt(10).toRem(),
        borderLeft: `${pt(0.75).toRem()} solid ${KEYLINE}`,
        color: INK,
      }}
    >
      {children}
    </div>
  );
}

export function SidebarBlock({ node }: { node: SidebarBlockNode }) {
  return (
    <div
      className="gm-sidebar"
      css={{ '&:not(:first-of-type)': { marginTop: pt(14).toRem() } }}
    >
      {node.content.map((segment, i) => (
        <Segment
          key={i}
          segment={segment}
          prevKind={node.content[i - 1]?.kind}
        />
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

// Top margin for a segment: a section break above headings, tight under a
// heading, a small gap between sibling paragraphs. First segment sits flush.
function topMargin(kind: SidebarSegment['kind'], prevKind?: string): string {
  if (prevKind === undefined) return '0';
  if (kind === 'heading') return pt(9).toRem();
  return prevKind === 'heading' ? pt(2).toRem() : pt(4).toRem();
}

function Segment({
  segment,
  prevKind,
}: {
  segment: SidebarSegment;
  prevKind?: string;
}) {
  const marginTop = topMargin(segment.kind, prevKind);

  if (segment.kind === 'heading') {
    // Both h1 and h2 are ALL-CAPS bold sans titles; h2 is a touch smaller for
    // stacked sub-sections within one callout.
    return (
      <p
        css={{
          fontFamily: SANS,
          fontWeight: 700,
          textTransform: 'uppercase',
          fontSize: segment.level === 1 ? pt(10).toRem() : pt(9).toRem(),
          lineHeight: pt(12).toRem(),
          margin: 0,
          marginTop,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'paragraph') {
    // Flush prose — no first-line indent (the lore boxes set their body flush).
    return (
      <p css={{ ...PARA_BASE, marginTop }}>{renderInlines(segment.content)}</p>
    );
  }

  if (segment.kind === 'list') {
    return (
      <ul css={{ ...PARA_BASE, marginTop, paddingLeft: pt(12).toRem() }}>
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
