import type { TableNode } from '../parser/scribe-parser';
import { pt } from './size-helper';
import { tighterMargin } from './style-helpers';

const HEADER_BG = '#083D41';
const ROW_DARK = '#EFE3C8';
const ROW_LIGHT = '#F5F0E0';
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
          {node.caption}
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
                  background: HEADER_BG,
                  color: '#fff',
                  fontWeight: 700,
                  padding: CELL_PAD,
                  verticalAlign: 'top',
                  whiteSpace: 'nowrap',
                  textAlign: node.alignments[i] ?? 'left',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          css={{
            '> tr:nth-of-type(odd) > td': { background: ROW_DARK },
            '> tr:nth-of-type(even) > td': { background: ROW_LIGHT },
          }}
        >
          {node.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  css={{
                    padding: CELL_PAD,
                    verticalAlign: 'top',
                    textAlign: node.alignments[ci] ?? 'left',
                  }}
                >
                  {cell}
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
                  background: `${ROW_LIGHT} !important`,
                }}
              >
                * {fn}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
