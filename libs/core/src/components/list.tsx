import type { ListNode } from '../parser';
import type { AnchorFn } from '../renderer/source-anchors';
import { pt } from './size-helper';
import { renderInlines } from './inline';
import { SERIF } from '../vendor/font-css';

// The list carries the anchor, not each `<li>`: the IR models items as
// `Inline[][]` with no per-item origin, so there is nothing to anchor them to.
export function List({ node, anchor }: { node: ListNode; anchor: AnchorFn }) {
  return (
    <ul
      {...anchor(node.origin)}
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
