import { Fragment, type ReactNode } from 'react';
import type { Inline } from '../parser';

export function renderInlines(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.kind === 'text') return <Fragment key={i}>{n.text}</Fragment>;
    if (n.kind === 'strong')
      return <strong key={i}>{renderInlines(n.children)}</strong>;
    return <em key={i}>{renderInlines(n.children)}</em>;
  });
}
