import type { HeadBlockNode, Segment } from '../parser';
import type { AnchorFn } from '../renderer/source-anchors';
import { pt } from './size-helper';
import { renderInlines } from './inline';
import { Ornament } from './ornament';
import { MARGIN } from './document';
import { DISPLAY_TITLE, SERIF } from '../vendor/font-css';

export function HeadBlock({
  node,
  anchor,
}: {
  node: HeadBlockNode;
  anchor: AnchorFn;
}) {
  const yPadding = 20;
  const ornamentSize = 11;
  const borderWidth = 1;
  return (
    <div
      {...anchor(node.origin)}
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
        <Segment key={i} segment={segment} anchor={anchor} />
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

function Segment({ segment, anchor }: { segment: Segment; anchor: AnchorFn }) {
  if (segment.kind === 'heading') {
    // h2 is the smaller chapter eyebrow above the title (e.g. "CHAPTER 1:" on
    // page 5); h1 is the large display title beneath it.
    if (segment.level === 2) {
      return (
        <h2
          {...anchor(segment.origin)}
          css={{
            fontFamily: DISPLAY_TITLE,
            fontSize: pt(16).toRem(),
            lineHeight: pt(18).toRem(),
            margin: 0,
          }}
        >
          {renderInlines(segment.content)}
        </h2>
      );
    }
    return (
      <h1
        {...anchor(segment.origin)}
        css={{
          fontFamily: DISPLAY_TITLE,
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
        {...anchor(segment.origin)}
        css={{
          fontFamily: SERIF,
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
