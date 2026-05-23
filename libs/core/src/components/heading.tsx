import type { HeadingNode } from '../parser';
import { pt } from './size-helper';
import styled from '@emotion/styled';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import {
  DISPLAY_CAPS,
  DISPLAY_TITLE,
  SANS,
  SANS_CONDENSED,
} from '../vendor/font-css';

const H4_BORDER = 1;
const H4_BORDER_GAP = 0.5;

export const H1 = styled.h1({
  fontFamily: DISPLAY_TITLE,
  fontSize: pt(14).toRem(),
  lineHeight: pt(16).toRem(),
  color: '#002A17',
  ...tighterMargin(4).withNormalMargin(8),
  breakAfter: 'avoid',
});

export const H2 = styled.h2({
  fontFamily: SANS,
  fontWeight: 700,
  fontSize: pt(12).toRem(),
  lineHeight: pt(13).toRem(),
  color: '#4E1C0D',
  ...tighterMargin(7).withNormalMargin(11),
  breakAfter: 'avoid',
});

export const H3 = styled.h3({
  fontFamily: SANS_CONDENSED,
  fontWeight: 700,
  fontSize: pt(12).toRem(),
  lineHeight: pt(12).toRem(),
  color: '#035D4F',
  margin: `${pt(12).toRem()} 0 0 0`,
  breakAfter: 'avoid',
});

export const H4 = styled.h4({
  fontFamily: DISPLAY_CAPS,
  textTransform: 'uppercase',
  fontSize: pt(12).toRem(),
  lineHeight: pt(14).toRem(),
  padding: `${pt(0.9).toRem()} 0 ${pt(2.6).toRem()} ${pt(4.5).toRem()}`,
  color: '#EEE2C7',
  background: '#002663',
  borderRadius: `${pt(7).toRem()} ${pt(3).toRem()} 0 0`,
  margin: `${pt(10.1).toRem()} 0 ${pt(H4_BORDER + H4_BORDER_GAP).toRem()} 0`,
  breakAfter: 'avoid',
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: pt(-H4_BORDER - H4_BORDER_GAP).toRem(),
    height: pt(H4_BORDER).toRem(),
    background: '#002663',
    pointerEvents: 'none',
  },
  ...tighterMargin.marker,
});

const TAGS = [H1, H2, H3, H4, 'h5', 'h6'] as const;

export function Heading({ node }: { node: HeadingNode }) {
  const level = Math.min(Math.max(node.level, 1), 6);
  const Comp = TAGS[level - 1];

  return <Comp>{renderInlines(node.content)}</Comp>;
}
