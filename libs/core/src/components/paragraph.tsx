import type { ParagraphIndent, ParagraphNode } from '../parser';
import type { AnchorFn } from '../renderer/source-anchors';
import { pt } from './size-helper';
import { renderInlines } from './inline';
import { SERIF } from '../vendor/font-css';

const INDENT_AMOUNT = '1rem';

export function indentStyle(indent: ParagraphIndent) {
  if (indent === 'first-line') return { textIndent: INDENT_AMOUNT };
  if (indent === 'hanging')
    return { paddingLeft: INDENT_AMOUNT, textIndent: `-${INDENT_AMOUNT}` };
  return undefined;
}

export function Paragraph({
  node,
  anchor,
}: {
  node: ParagraphNode;
  anchor: AnchorFn;
}) {
  return (
    <p
      {...anchor(node.origin)}
      css={{
        fontFamily: SERIF,
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
