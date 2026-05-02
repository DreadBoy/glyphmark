import { Fragment, type ReactNode } from 'react';
import type { CellInline, TableNode } from '../parser';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';
import { renderInlines } from './inline';

const CELL_PAD = `0 ${pt(4).toRem()}`;

export function Table({ node }: { node: TableNode }) {
  return (
    <div
      css={{
        breakInside: 'avoid',
        ...tighterMargin.marker,
      }}
    >
      {node.caption && (
        <div
          css={{
            fontFamily: 'ff-good-web-pro-condensed',
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
          fontFamily: 'ff-good-web-pro',
          fontSize: pt(8).toRem(),
          lineHeight: pt(12).toRem(),
        }}
      >
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
                  verticalAlign: 'bottom',
                  textAlign: node.alignments[i],
                }}
              >
                {renderCell(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody css={{}}>
          {node.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  css={{
                    padding: CELL_PAD,
                    verticalAlign: 'bottom',
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
                colSpan={node.headers.length}
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
