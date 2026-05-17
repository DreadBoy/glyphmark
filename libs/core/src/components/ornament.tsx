import { pt } from './size-helper';

// Pure shape ratios — everything is expressed as a multiple of the ornament's
// overall height. Absolute size and stroke thickness are injected by the parent.
const ORNAMENT = {
  color: '#191000',
  circleRadiusRatio: 1 / 3,
  diamondInnerLenRatio: 2 / 3,
  diamondOuterLenRatio: 20 / 9,
  diamondCurve: 0.3,
} as const;

// Renders the diamond-circle-diamond decoration.
export function Ornament({
  heightPt,
  boxPadding,
  borderWidth,
  edge,
}: {
  heightPt: number;
  boxPadding: number;
  borderWidth: number;
  edge: 'top' | 'bottom';
}) {
  const o = ORNAMENT;
  // Resolve ratios to absolute pt sizes using the height the parent gave us.
  const diamondHalfHeight = heightPt / 2;
  const circleRadius = heightPt * o.circleRadiusRatio;
  const diamondInnerLen = heightPt * o.diamondInnerLenRatio;
  const diamondOuterLen = heightPt * o.diamondOuterLenRatio;

  // The central SVG holds just diamond-circle-diamond. Its width is sized so the
  // diamonds' outer tips land exactly on the SVG's left/right edges, where the
  // flex tail-lines pick up — that's what makes the taper seamless.
  const diamondLen = diamondInnerLen + diamondOuterLen;
  const halfW = circleRadius + diamondLen;
  const totalW = halfW * 2;
  const totalH = heightPt;
  const cx = totalW / 2;
  const cy = totalH / 2;

  const halfB = borderWidth / 2;
  const diamondPath = (sign: 1 | -1) => {
    const xI = cx + sign * circleRadius; // inner edge x (toward circle)
    const xO = cx + sign * halfW; // outer edge x (toward border tail)
    const xC = xI + sign * diamondInnerLen; // top/bottom vertex x (asymmetric along long axis)
    const yT = cy - diamondHalfHeight;
    const yB = cy + diamondHalfHeight;
    // Inner/outer ends of the diamond are blunt vertical edges (not pointy tips)
    // of this height. Match the box border thickness so the inner edge butts up
    // visibly against the circle and the outer edge merges flush into the border.
    // Six vertices: two blunt vertical edges (inner/outer, height = borderWidth)
    // and the pointy top/bottom vertices.
    const innerTop = [xI, cy - halfB] as const;
    const innerBot = [xI, cy + halfB] as const;
    const outerTop = [xO, cy - halfB] as const;
    const outerBot = [xO, cy + halfB] as const;
    // Quadratic control point for an edge from P1→P2, pulled toward (xC, cy) by `diamondCurve`.
    // Higher diamondCurve → more concave (edges bow inward).
    const cp = (p1x: number, p1y: number, p2x: number, p2y: number) => {
      const mx = (p1x + p2x) / 2;
      const my = (p1y + p2y) / 2;
      return [
        mx + o.diamondCurve * (xC - mx),
        my + o.diamondCurve * (cy - my),
      ] as const;
    };
    const [c1x, c1y] = cp(outerTop[0], outerTop[1], xC, yT);
    const [c2x, c2y] = cp(xC, yT, innerTop[0], innerTop[1]);
    const [c3x, c3y] = cp(innerBot[0], innerBot[1], xC, yB);
    const [c4x, c4y] = cp(xC, yB, outerBot[0], outerBot[1]);
    return (
      `M ${outerTop[0]},${outerTop[1]} ` +
      `Q ${c1x},${c1y} ${xC},${yT} ` +
      `Q ${c2x},${c2y} ${innerTop[0]},${innerTop[1]} ` +
      `L ${innerBot[0]},${innerBot[1]} ` +
      `Q ${c3x},${c3y} ${xC},${yB} ` +
      `Q ${c4x},${c4y} ${outerBot[0]},${outerBot[1]} ` +
      `Z`
    );
  };

  const visualHalfH = Math.max(circleRadius, diamondHalfHeight);
  const shiftPt = boxPadding + visualHalfH - borderWidth / 2;
  return (
    <div
      css={{
        display: 'flex',
        justifyContent: 'center',
        height: 0,
        overflow: 'visible',
        transform:
          edge === 'top'
            ? `translateY(${pt(-shiftPt).toRem()})`
            : `translateY(${pt(shiftPt - totalH).toRem()})`,
      }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        css={{
          width: pt(totalW).toRem(),
          height: pt(totalH).toRem(),
          display: 'block',
          overflow: 'visible',
        }}
      >
        <path d={diamondPath(-1)} fill={o.color} />
        <circle cx={cx} cy={cy} r={circleRadius} fill={o.color} />
        <path d={diamondPath(1)} fill={o.color} />
      </svg>
    </div>
  );
}
