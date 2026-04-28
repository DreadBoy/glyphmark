import type { HeadingNode } from '../parser/scribe-parser';
import { pt } from './size-helper';
import styled from '@emotion/styled';

const H4_BORDER = 1;
const H4_BORDER_GAP = 0.5;

export const H4 = styled.h4({
  fontFamily: 'gin',
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
});

const TAGS = ['h1', 'h2', 'h3', H4, 'h5', 'h6'] as const;

export function Heading({ node }: { node: HeadingNode }) {
  const level = Math.min(Math.max(node.level, 1), 6);
  const Comp = TAGS[level - 1];

  return <Comp>{node.text}</Comp>;
}
