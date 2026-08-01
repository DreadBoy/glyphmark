import type { CSSObject } from '@emotion/react';
import type { InfoBlockNode, InfoSegment } from '../parser';
import type { AnchorFn } from '../renderer/source-anchors';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import { SANS } from '../vendor/font-css';

const BG = '#002A17';
const FG = '#FFFFFF';
const BORDER = '#B39D73';

export function InfoBlock({
  node,
  anchor,
}: {
  node: InfoBlockNode;
  anchor: AnchorFn;
}) {
  const xPadding = 8.5;
  const yPadding = 10;
  const borderWidth = 1;
  const ruleInset = 5.5;
  const hasColumnBreak = node.content.some((s) => s.kind === 'column-break');
  return (
    <div
      {...anchor(node.origin)}
      css={{
        background: BG,
        color: FG,
        padding: `${pt(yPadding).toRem()} ${pt(xPadding).toRem()}`,
        boxShadow: `inset 0 0 0 ${pt(borderWidth).toRem()} ${BORDER}`,
        breakInside: 'avoid',
        ...(hasColumnBreak
          ? {
              columnCount: 2,
              columnGap: pt(xPadding * 2).toRem(),
              position: 'relative',
              '&::before': {
                content: '""',
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                top: pt(ruleInset).toRem(),
                bottom: pt(ruleInset).toRem(),
                width: pt(borderWidth).toRem(),
                background: BORDER,
              },
            }
          : {}),
      }}
    >
      {node.content.map((segment, i) => (
        <Segment key={i} segment={segment} anchor={anchor} />
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

function Segment({
  segment,
  anchor,
}: {
  segment: InfoSegment;
  anchor: AnchorFn;
}) {
  if (segment.kind === 'heading') {
    if (segment.level === 1)
      return (
        <p
          {...anchor(segment.origin)}
          css={{
            fontFamily: SANS,
            fontWeight: 700,
            textTransform: 'uppercase',
            fontSize: pt(12).toRem(),
            lineHeight: pt(13).toRem(),
            margin: 0,
          }}
        >
          {renderInlines(segment.content)}
        </p>
      );
    return (
      <p
        {...anchor(segment.origin)}
        css={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: pt(11).toRem(),
          lineHeight: pt(12).toRem(),
          margin: 0,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'paragraph') {
    return (
      <p
        {...anchor(segment.origin)}
        css={{ ...PARA_BASE, ...tighterMargin.marker }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'column-break') {
    return <div css={{ breakAfter: 'column' }} />;
  }

  return null;
}
