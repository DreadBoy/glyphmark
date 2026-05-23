import type { CSSObject } from '@emotion/react';
import type { RuleBlockNode, RuleSegment } from '../parser';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import { Table } from './table';
import { Ornament } from './ornament';
import { SANS, SANS_CONDENSED } from '../vendor/font-css';

export function RuleBlock({ node }: { node: RuleBlockNode }) {
  const yPadding = 13;
  const xPadding = 10;
  const ornamentSize = 11;
  const borderWidth = 1;
  return (
    <div
      css={{
        background: '#EAD9B3',
        padding: `${pt(yPadding).toRem()} ${pt(xPadding).toRem()} ${pt(yPadding).toRem()} ${pt(xPadding).toRem()}`,
        boxShadow: `inset 0 0 0 ${pt(borderWidth).toRem()} #191000`,
        breakInside: 'avoid',
        ...tighterMargin(6).withNormalMargin(12),
        ...tighterMargin.marker,
      }}
    >
      <Ornament
        heightPt={ornamentSize}
        boxPadding={yPadding}
        borderWidth={borderWidth}
        edge="top"
      />
      <div
        css={
          node.fullWidth
            ? {
                columnCount: 2,
                columnGap: pt(14).toRem(),
              }
            : undefined
        }
      >
        {node.content.map((segment, i) => (
          <Segment key={i} segment={segment} />
        ))}
      </div>
      <Ornament
        heightPt={ornamentSize}
        boxPadding={yPadding}
        borderWidth={borderWidth}
        edge="bottom"
      />
    </div>
  );
}

const PARA_BASE: CSSObject = {
  margin: 0,
  fontFamily: SANS,
  fontSize: pt(8).toRem(),
  lineHeight: pt(12).toRem(),
};

function Segment({ segment }: { segment: RuleSegment }) {
  if (segment.kind === 'heading') {
    if (segment.level === 1) {
      return (
        <p
          css={{
            textAlign: 'center',
            fontFamily: SANS_CONDENSED,
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: pt(11).toRem(),
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
          textAlign: 'center',
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

  if (segment.kind === 'column-break') {
    return <div css={{ breakAfter: 'column' }} />;
  }

  if (segment.kind === 'table') {
    return <Table node={segment.node} />;
  }

  return null;
}
