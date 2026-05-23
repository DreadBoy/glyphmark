import type { ListNode } from '../parser';
import { pt } from './size-helper';
import { renderInlines } from './inline';
import { SERIF } from '../vendor/font-css';

export function List({ node }: { node: ListNode }) {
  return (
    <ul
      css={{
        margin: 0,
        paddingLeft: node.indent === 'block' ? pt(18).toRem() : 0,
        fontFamily: SERIF,
        fontSize: pt(8).toRem(),
        lineHeight: pt(12).toRem(),
      }}
    >
      {node.items.map((item, i) => (
        <li key={i}>{renderInlines(item)}</li>
      ))}
    </ul>
  );
}
