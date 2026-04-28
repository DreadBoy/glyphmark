import type { ItemBlockNode } from '../parser/scribe-parser';
import { pt } from './size-helper';
import { Hr } from './hr';
import { tighterMargin } from './style-helpers';

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
          {node.name}
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
            {node.subtitle}
          </h4>
        )}
      </div>
      <Hr />
      <p
        css={{
          fontFamily: 'ff-good-web-pro',
          fontSize: pt(8).toRem(),
          lineHeight: pt(12).toRem(),
          margin: 0,
        }}
      >
        {node.body}
      </p>
    </>
  );
}
