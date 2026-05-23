import { Fragment, type ReactNode } from 'react';
import type { Inline } from '../parser';
import { ACTION_SYMBOLS } from '../vendor/action-symbols';

export function renderInlines(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.kind === 'text') return <Fragment key={i}>{n.text}</Fragment>;
    if (n.kind === 'strong')
      return <strong key={i}>{renderInlines(n.children)}</strong>;
    if (n.kind === 'em') return <em key={i}>{renderInlines(n.children)}</em>;
    const meta = ACTION_SYMBOLS[n.symbol];
    return (
      <img
        key={i}
        src={meta.icon}
        alt={meta.label}
        css={{ height: '1em', verticalAlign: '-0.125em' }}
      />
    );
  });
}
