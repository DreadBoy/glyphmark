import type { HeadBlockNode, Segment } from '../parser';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import { Ornament } from './ornament';
import { MARGIN } from './document';

export function HeadBlock({ node }: { node: HeadBlockNode }) {
  const yPadding = 20;
  const ornamentSize = 11;
  const borderWidth = 1;
  return (
    <div
      css={{
        columnSpan: 'all',
        textAlign: 'center',
        background: '#EAD9B3',
        color: '#002A17',
        margin: `${pt(-MARGIN).toRem()} ${pt(-MARGIN).toRem()} ${pt(yPadding).toRem()} ${pt(-MARGIN).toRem()}`,
        padding: `${pt(40).toRem()} ${pt(MARGIN).toRem()} ${pt(yPadding).toRem()} ${pt(MARGIN).toRem()}`,
        boxShadow: `inset 0 ${pt(-borderWidth).toRem()} 0 0 #191000`,
        breakInside: 'avoid',
        breakAfter: 'avoid',
      }}
    >
      {node.content.map((segment, i) => (
        <Segment key={i} segment={segment} />
      ))}
      <Ornament
        heightPt={ornamentSize}
        boxPadding={yPadding}
        borderWidth={borderWidth}
        edge="bottom"
      />
    </div>
  );
}

function Segment({ segment }: { segment: Segment }) {
  if (segment.kind === 'heading') {
    return (
      <h1
        css={{
          fontFamily: 'Taroca',
          fontSize: pt(20).toRem(),
          lineHeight: pt(22).toRem(),
          margin: 0,
        }}
      >
        {renderInlines(segment.content)}
      </h1>
    );
  }

  if (segment.kind === 'paragraph') {
    return (
      <p
        css={{
          fontFamily: 'SabonLTStd, serif',
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: pt(10).toRem(),
          lineHeight: pt(13).toRem(),
          textAlign: 'justify',
          margin: `0`,
          marginTop: pt(3.6).toRem(),
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  return null;
}
