import type { SampleBlockNode, SampleSegment } from '../parser';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';

export function SampleBlock({ node }: { node: SampleBlockNode }) {
  return (
    <div
      css={{
        background: '#E5D7D3',
        padding: `${pt(7.3).toRem()} ${pt(10).toRem()} ${pt(4.7).toRem()} ${pt(10).toRem()}`,
        breakInside: 'avoid',
        ...tighterMargin(3).withNormalMargin(7),
        ...tighterMargin.marker,
      }}
    >
      {node.content.map((segment, i) => (
        <Segment key={i} segment={segment} />
      ))}
    </div>
  );
}

const HEADING_BASE = {
  textAlign: 'center' as const,
  fontFamily: 'ff-good-web-pro-condensed',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
};

const PARA_BASE = {
  margin: 0,
  fontFamily: 'ff-good-web-pro',
  fontSize: pt(8).toRem(),
  lineHeight: pt(12).toRem(),
};

function Segment({ segment }: { segment: SampleSegment }) {
  if (segment.kind === 'heading') {
    if (segment.level === 1) {
      return (
        <p
          css={{
            ...HEADING_BASE,
            fontSize: pt(11).toRem(),
            lineHeight: pt(12).toRem(),
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
          ...HEADING_BASE,
          textTransform: 'none',
          fontFamily: 'ff-good-web-pro',
          fontSize: pt(11).toRem(),
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
          ...tighterMargin.marker,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'centered-paragraph') {
    return (
      <p
        css={{
          ...PARA_BASE,
          textAlign: 'center',
          ...tighterMargin.marker,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  return null;
}
