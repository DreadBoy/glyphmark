import type { ItemBlockNode, ItemSegment } from '../parser';
import { pt } from './size-helper';
import { Hr } from './hr';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import { ColumnBreak } from './column-break';
import { PageBreak } from './page-break';
import { ACTION_SYMBOLS } from '../vendor/action-symbols';
import { SANS, SANS_CONDENSED } from '../vendor/font-css';
import { indentStyle } from './paragraph';

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
            fontFamily: SANS_CONDENSED,
            textTransform: 'uppercase',
            fontSize: pt(12).toRem(),
            lineHeight: pt(12).toRem(),
            fontWeight: 'bold',
            margin: 0,
            ...(node.action
              ? {
                  display: 'inline-flex',
                  alignItems: 'center',
                }
              : {}),
          }}
        >
          {renderInlines(node.name)}
          {node.action && (
            <img
              src={ACTION_SYMBOLS[node.action].icon}
              alt={ACTION_SYMBOLS[node.action].label}
              css={{
                marginLeft: pt(2).toRem(),
                height: pt(12).toRem(),
              }}
            />
          )}
        </h4>
        {node.subtitle && (
          <h4
            css={{
              fontFamily: SANS_CONDENSED,
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
      {node.traits.length > 0 && <Traits traits={node.traits} />}
      {node.content.map((segment, i) => (
        <ItemSegment key={i} segment={segment} />
      ))}
    </>
  );
}

function ItemSegment({ segment }: { segment: ItemSegment }) {
  if (segment.kind === 'hr') return <Hr />;
  if (segment.kind === 'column-break') {
    return <ColumnBreak />;
  }
  if (segment.kind === 'page-break') {
    return <PageBreak />;
  }
  if (segment.kind === 'paragraph') {
    return (
      <p
        css={{
          fontFamily: SANS,
          fontSize: pt(8).toRem(),
          lineHeight: pt(12).toRem(),
          margin: 0,
          ...indentStyle(segment.indent),
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
          margin: 0,
          paddingLeft: segment.indent === 'block' ? pt(18).toRem() : 0,
          fontFamily: SANS,
          fontSize: pt(8).toRem(),
          lineHeight: pt(12).toRem(),
        }}
      >
        {segment.items.map((item, i) => (
          <li key={i}>{renderInlines(item)}</li>
        ))}
      </ul>
    );
  }
  return null;
}

function traitInfo(trait: string): { rank: number; bg: string } {
  return (
    {
      uncommon: { rank: 0, bg: '#98503C' },
      rare: { rank: 0, bg: '#002564' },
      unique: { rank: 0, bg: '#54166D' },
      // Alignment (rank 1)
      lg: { rank: 1, bg: '#566193' },
      ln: { rank: 1, bg: '#566193' },
      le: { rank: 1, bg: '#566193' },
      ng: { rank: 1, bg: '#566193' },
      n: { rank: 1, bg: '#566193' },
      ne: { rank: 1, bg: '#566193' },
      cg: { rank: 1, bg: '#566193' },
      cn: { rank: 1, bg: '#566193' },
      ce: { rank: 1, bg: '#566193' },
      // Size (rank 2)
      tiny: { rank: 2, bg: '#3A7A58' },
      small: { rank: 2, bg: '#3A7A58' },
      medium: { rank: 2, bg: '#3A7A58' },
      large: { rank: 2, bg: '#3A7A58' },
      huge: { rank: 2, bg: '#3A7A58' },
      gargantuan: { rank: 2, bg: '#3A7A58' },
    }[trait.toLowerCase().trim()] ?? {
      rank: 3,
      bg: '#5D0000',
    }
  );
}

function Traits({ traits }: { traits: string[] }) {
  const TRAIT_GOLD = '#D8C384';

  const sorted = traits
    .map((t, i) => ({ t, i, rank: traitInfo(t).rank }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.t);

  const pillBase = {
    display: 'inline-block',
    padding: `${pt(2.25).toRem()} ${pt(4.5).toRem()} ${pt(0.9).toRem()}`,
    fontFamily: SANS_CONDENSED,
    fontWeight: 700,
    fontSize: pt(7.2).toRem(),
    lineHeight: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: '#fff',
    border: `${pt(1.35).toRem()} solid ${TRAIT_GOLD}`,
    borderLeftWidth: pt(0.9).toRem(),
    borderRightWidth: pt(0.9).toRem(),
  } as const;

  const edge = {
    ...pillBase,
    width: 0,
    padding: `${pt(2.25).toRem()} 0 ${pt(0.9).toRem()}`,
    background: TRAIT_GOLD,
    borderRightWidth: pt(1.8).toRem(),
    overflow: 'hidden',
    verticalAlign: 'top',
  } as const;

  return (
    <div css={{ marginTop: pt(2.25).toRem() }}>
      <span css={edge}>&nbsp;</span>
      {sorted.map((trait, i) => (
        <span key={i} css={{ ...pillBase, background: traitInfo(trait).bg }}>
          {trait}
        </span>
      ))}
      <span css={edge}>&nbsp;</span>
    </div>
  );
}
