import type { ParagraphNode } from '../parser';
import { pt } from './size-helper';
import styled from '@emotion/styled';
import { renderInlines } from './inline';

const P = styled.p({
  fontFamily: 'linotype-sabon',
  fontSize: pt(8).toRem(),
  lineHeight: pt(12).toRem(),
  margin: 0,
});

export function Paragraph({ node }: { node: ParagraphNode }) {
  return (
    <P
      css={{
        [`${P} + &${P}`]: {
          textIndent: '1rem',
        },
      }}
    >
      {renderInlines(node.content)}
    </P>
  );
}
