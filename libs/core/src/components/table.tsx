import { Fragment, type ReactNode } from 'react';
import type { CellInline, TableNode } from '../parser';
import type { AnchorFn } from '../renderer/source-anchors';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';
import { SANS, SANS_CONDENSED } from '../vendor/font-css';

const CELL_PAD = `0 ${pt(4).toRem()}`;

// Anchored as a whole rather than per row: rows are `CellInline[][]` and carry
// no origin of their own.
export function Table({ node, anchor }: { node: TableNode; anchor: AnchorFn }) {
  return (
    <div
      {...anchor(node.origin)}
      css={{
        breakInside: 'avoid',
        ...tighterMargin.marker,
      }}
    >
      {node.caption && (
        <div
          css={{
            fontFamily: SANS_CONDENSED,
            fontWeight: 700,
            fontSize: pt(12).toRem(),
            lineHeight: pt(15).toRem(),
            textTransform: 'uppercase',
            color: '#000',
          }}
        >
          {renderCell(node.caption)}
        </div>
      )}
      <table
        css={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: SANS,
          fontSize: pt(8).toRem(),
          lineHeight: pt(12).toRem(),
        }}
      >
        {node.headers.length > 0 && (
          <thead>
            <tr>
              {node.headers.map((h, i) => (
                <th
                  key={i}
                  css={{
                    background: '#002B16',
                    color: '#fff',
                    fontWeight: 700,
                    padding: CELL_PAD,
                    verticalAlign: 'top',
                    textAlign: node.alignments[i],
                  }}
                >
                  {renderCell(h)}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody css={{}}>
          {node.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  css={{
                    padding: CELL_PAD,
                    verticalAlign: 'top',
                    textAlign: node.alignments[ci],
                    'tr:nth-of-type(odd) > &': { background: '#F0E2C6' },
                    'tr:nth-of-type(even) > &': { background: '#F6EEDF' },
                  }}
                >
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
          {node.footnotes.map((fn, i) => (
            <tr key={`fn-${i}`}>
              <td
                colSpan={node.colCount}
                css={{
                  padding: CELL_PAD,
                  verticalAlign: 'top',
                  background: `#EBD7AE`,
                }}
              >
                {renderFootnoteRef(fn)} {renderInlines(fn.children)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderCell(nodes: CellInline[]): ReactNode {
  return nodes.map((n, i) => {
    if (n.kind === 'footnote-ref') {
      return (
        <Fragment key={i}>
          {renderInlines(n.children)}
          {renderFootnoteRef(n)}
        </Fragment>
      );
    }
    return <Fragment key={i}>{renderInlines([n])}</Fragment>;
  });
}

function renderFootnoteRef(
  m: { type: 'unnumbered' } | { type: 'numbered'; value: string },
): ReactNode {
  return m.type === 'unnumbered' ? (
    '*'
  ) : (
    <sup css={{ fontSize: pt(5.2).toRem() }}>{m.value}</sup>
  );
}
