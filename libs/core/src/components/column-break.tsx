import type { ColumnBreakNode } from '../parser';

// `node` is optional because segment-level column breaks (inside item/rule)
// reuse this component without going through the body-node path — they don't
// carry the `trailing` flag and never need the sentinel (their column flow is
// scoped to the inner block).
export function ColumnBreak({ node }: { node?: ColumnBreakNode }) {
  return (
    <>
      <div
        // Inline style — emotion-emitted CSS rules go through Paged.js's
        // preprocessor, which strips `break-after: column` (it only re-applies
        // page/always/left/right/recto/verso values; see pagedjs/src/polisher/
        // base.js:643). Inline `style=` attributes are left untouched.
        style={{ breakAfter: 'column' }}
      />
      {node?.trailing && (
        // Sentinel: when nothing real follows the break, the CSS column
        // balancer would pull content back across it. An nbsp in column 2
        // gives the balancer a reason to keep the break.
        <div aria-hidden="true">{' '}</div>
      )}
    </>
  );
}
