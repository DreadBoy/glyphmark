import type { ColumnBreakNode } from '../parser';

export function ColumnBreak({ node: _node }: { node: ColumnBreakNode }) {
  return (
    <div
      css={{
        breakAfter: 'column',
      }}
    />
  );
}
