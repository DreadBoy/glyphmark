import { Fragment, type ReactNode } from 'react';
import type { Inline } from '../parser';
import { ACTION_SYMBOLS } from '../vendor/action-symbols';

export function renderInlines(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.kind === 'text') return <Fragment key={i}>{n.text}</Fragment>;
    if (n.kind === 'strong')
      return <strong key={i}>{renderInlines(n.children)}</strong>;
    if (n.kind === 'em') return <em key={i}>{renderInlines(n.children)}</em>;
    // Relative `em` (not pt) so sup/sub scale with the surrounding context
    // (12pt body, 8pt cell, headings). `verticalAlign: baseline` + a
    // `position: relative` offset raises/lowers the glyph without enlarging
    // the tight (`line-height: 1`) line box.
    if (n.kind === 'sup')
      return (
        <sup
          key={i}
          css={{
            fontSize: '0.75em',
            verticalAlign: 'baseline',
            position: 'relative',
            top: '-0.35em',
          }}
        >
          {renderInlines(n.children)}
        </sup>
      );
    if (n.kind === 'sub')
      return (
        <sub
          key={i}
          css={{
            fontSize: '0.75em',
            verticalAlign: 'baseline',
            position: 'relative',
            top: '0.2em',
          }}
        >
          {renderInlines(n.children)}
        </sub>
      );
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
