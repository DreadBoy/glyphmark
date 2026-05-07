import type { ListNode } from '../parser';
import { pt } from './size-helper';
import { renderInlines } from './inline';

export function List({ node }: { node: ListNode }) {
  return (
    <ul
      css={{
        margin: 0,
        paddingLeft: node.indent === 'block' ? pt(18).toRem() : 0,
        fontFamily: 'linotype-sabon',
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
