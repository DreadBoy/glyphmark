import type { ParagraphIndent, ParagraphNode } from '../parser';
import { pt } from './size-helper';
import { renderInlines } from './inline';

const INDENT_AMOUNT = '1rem';

export function indentStyle(indent: ParagraphIndent) {
  if (indent === 'first-line') return { textIndent: INDENT_AMOUNT };
  if (indent === 'hanging')
    return { paddingLeft: INDENT_AMOUNT, textIndent: `-${INDENT_AMOUNT}` };
  return undefined;
}

export function Paragraph({ node }: { node: ParagraphNode }) {
  return (
    <p
      css={{
        fontFamily: 'linotype-sabon',
        fontSize: pt(8).toRem(),
        lineHeight: pt(12).toRem(),
        margin: 0,
        ...indentStyle(node.indent),
      }}
    >
      {renderInlines(node.content)}
    </p>
  );
}
