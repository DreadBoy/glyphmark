import type { ItemBlockNode, Segment } from '../parser';
import { pt } from './size-helper';
import { Hr } from './hr';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';

export function ItemBlock({ node }: { node: ItemBlockNode }) {
  return (
    <>
      <div
        css={{
          display: 'flex',
          justifyContent: 'space-between',
          ...tighterMargin(7).withNormalMargin(12),
          breakAfter: 'avoid',
        }}
      >
        <h4
          css={{
            fontFamily: 'ff-good-web-pro-condensed',
            textTransform: 'uppercase',
            fontSize: pt(12).toRem(),
            lineHeight: pt(12).toRem(),
            fontWeight: 'bold',
            margin: 0,
          }}
        >
          {renderInlines(node.name)}
        </h4>
        {node.subtitle && (
          <h4
            css={{
              fontFamily: 'ff-good-web-pro-condensed',
              textTransform: 'uppercase',
              fontSize: pt(12).toRem(),
              lineHeight: pt(12).toRem(),
              fontWeight: 'bold',
              margin: 0,
            }}
          >
            {renderInlines(node.subtitle)}
          </h4>
        )}
      </div>
      <Hr />
      {node.content.map((segment, i) => (
        <ItemSegment key={i} segment={segment} />
      ))}
    </>
  );
}

function ItemSegment({ segment }: { segment: Segment }) {
  if (segment.kind === 'hr') return <Hr />;
  if (segment.kind === 'column-break') {
    return <div css={{ breakAfter: 'column' }} />;
  }
  if (segment.kind === 'paragraph') {
    return (
      <p
        css={{
          fontFamily: 'ff-good-web-pro',
          fontSize: pt(8).toRem(),
          lineHeight: pt(12).toRem(),
          margin: 0,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }
  // 'heading', 'list', 'centered-paragraph' segments don't have renderers yet.
  return null;
}
