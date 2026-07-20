import type { CSSObject } from '@emotion/react';
import type { SidebarBlockNode, SidebarSegment } from '../parser';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import { Table } from './table';
import { SANS, SANS_CONDENSED } from '../vendor/font-css';

// A tinted margin/aside callout (the rulebooks' lore/ecology boxes, e.g. Monster
// Core's "AEON DIVINITIES"). Visually its own thing: the warm parchment tint of a
// rule() box but without the ornaments, and an info()-style bold ALL-CAPS title.
// Renders in-flow (sits in its column); outer-edge placement is out of scope here.
const BG = '#EAD9B3';
const BORDER = '#191000';

export function SidebarBlock({ node }: { node: SidebarBlockNode }) {
  const yPadding = 10;
  const xPadding = 8.5;
  const borderWidth = 1;
  return (
    <div
      className="gm-sidebar"
      css={{
        background: BG,
        padding: `${pt(yPadding).toRem()} ${pt(xPadding).toRem()}`,
        boxShadow: `inset 0 0 0 ${pt(borderWidth).toRem()} ${BORDER}`,
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
  lineHeight: pt(12).toRem(),
};

function Segment({ segment }: { segment: SidebarSegment }) {
  if (segment.kind === 'heading') {
    if (segment.level === 1) {
      return (
        <p
          css={{
            fontFamily: SANS_CONDENSED,
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: pt(12).toRem(),
            lineHeight: pt(13).toRem(),
            ...tighterMargin(12).withNormalMargin(0),
            ...tighterMargin.marker,
          }}
        >
          {renderInlines(segment.content)}
        </p>
      );
    }
    return (
      <p
        css={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: pt(9).toRem(),
          lineHeight: pt(12).toRem(),
          ...tighterMargin(12).withNormalMargin(0),
          ...tighterMargin.marker,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'paragraph') {
    return (
      <p
        css={{
          ...PARA_BASE,
          ...(segment.indent === 'first-line'
            ? { textIndent: '1rem' }
            : undefined),
          ...tighterMargin.marker,
        }}
      >
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
