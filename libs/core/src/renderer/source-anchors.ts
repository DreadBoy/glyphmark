import type { Origin, TokenId, TokenSpan } from '../parser';

/**
 * Attribute carrying the 1-based source line an element starts at, and the one
 * it ends at. Emitted only when `renderToHtml` is asked for source anchors —
 * see {@link createAnchorFn} for why the end line is worth its own attribute.
 *
 * These names are part of the anchor contract: the plugin's preview reads them
 * back out of the rendered document to line the preview up with the editor.
 * Renaming one is a breaking change for that consumer.
 */
export const LINE_ATTR = 'data-glyph-line';
export const END_LINE_ATTR = 'data-glyph-line-end';

/** The attributes an anchored element carries; spread onto its JSX. */
export type AnchorAttrs = {
  [LINE_ATTR]?: number;
  [END_LINE_ATTR]?: number;
};

/**
 * Resolves a node's {@link Origin} to the DOM attributes that anchor it back to
 * source. Spread onto the element that visually represents the node.
 *
 * Returns `undefined` for an origin whose tokens are not in the map — a
 * defensive case rather than an expected one, since a node's origin always
 * comes from the same parse as the map. Callers spread the result either way
 * (`{...anchor(node.origin)}`), so an unresolvable anchor degrades to "this
 * element is not anchored" rather than throwing.
 */
export type AnchorFn = (origin: Origin | undefined) => AnchorAttrs | undefined;

/**
 * The {@link AnchorFn} used when anchors are switched off.
 *
 * Whether to emit anchors at all is the *renderer's* decision, taken once from
 * `RenderOptions`; by the time it reaches a component the question is settled,
 * so `anchor` is a required prop everywhere rather than an optional one. A
 * component that forgets to thread it down is then a type error instead of an
 * element that quietly stops being anchored — which is the failure that would
 * otherwise go unnoticed, since nothing about the rendered page looks wrong.
 */
export const NO_ANCHORS: AnchorFn = () => undefined;

/**
 * Narrows an origin to its opening token, so an element gets the span of the
 * line it starts on rather than of everything it encloses.
 *
 * Needed where one small element stands in for a large node: an `item()`
 * block's header is a single strip of text, but the block's own origin covers
 * every line down to the closing paren. Anchored with the full span, the
 * header claims to be forty lines tall in a twenty-pixel box, and
 * {@link offsetToLine} duly interpolates a line from the middle of the block
 * out of a reader who is looking at its title.
 */
export function startOf(origin: Origin): Origin {
  return { first: origin.first, last: origin.first };
}

/**
 * Builds the {@link AnchorFn} for one parse.
 *
 * Both the start *and* end line are emitted. Start alone would be enough to
 * find an element for a line, but not to place a line *within* it: an `item()`
 * block routinely spans forty source lines and renders as one box, so
 * start-only sync stair-steps — forty keystrokes of scrolling in the editor
 * move the preview not at all, then all at once. With the span known, the
 * preview interpolates inside the element's own box.
 */
export function createAnchorFn(map: Map<TokenId, TokenSpan>): AnchorFn {
  return (origin) => {
    if (!origin) return undefined;
    const first = map.get(origin.first);
    const last = map.get(origin.last);
    if (!first || !last) return undefined;
    return {
      [LINE_ATTR]: first.startLine,
      [END_LINE_ATTR]: Math.max(last.endLine, first.startLine),
    };
  };
}

/**
 * One anchored element, as measured in the rendered document.
 *
 * `top`/`bottom` are document-space vertical offsets — the scroll offset is
 * already folded in — so they stay valid no matter where the document happened
 * to be scrolled when they were measured.
 */
export interface SourceAnchor {
  /** 1-based source line the element starts at. */
  line: number;
  /** 1-based source line the element ends at; never less than `line`. */
  endLine: number;
  top: number;
  bottom: number;
}

/**
 * Where to scroll the rendered document so that `line` is at the top of the
 * viewport, or `null` only when nothing is anchored at all.
 *
 * A line *before* the first anchor is not a failure — a document that opens
 * with blank lines or a comment has content above anything anchorable, and a
 * reader at the top of it expects the top of the preview, not a request that
 * silently does nothing. Such lines resolve to the first anchor.
 *
 * `anchors` must be in **document order**, which — because the renderer walks
 * the IR in reading order and content references retarget their origins to the
 * call site — means `line` is non-decreasing across the array. That invariant
 * is what makes the binary search below valid; it is asserted over every golden
 * fixture in `test/golden/anchors.test.ts`.
 *
 * Deliberately *not* ordered by `top`: a page is laid out in two columns, so
 * the second column's content sits visually *above* content that follows it in
 * source. Vertical position is not monotonic in source order and never will be.
 */
export function lineToOffset(
  anchors: readonly SourceAnchor[],
  line: number,
): number | null {
  if (anchors.length === 0) return null;
  const at = lastAnchorAtOrBefore(anchors, line);
  if (at === -1) return anchors[0].top;
  const anchor = anchors[at];

  // Fraction of the way through the element's source span, applied to its own
  // box. `endLine - line + 1` rather than `- line`, so a single-line element
  // has a span of 1 instead of 0; the cost is that a target of exactly
  // `endLine` lands just short of the element's bottom, which is what you want
  // anyway — the last line of a block should still be on screen.
  const span = anchor.endLine - anchor.line + 1;
  const through = Math.min(Math.max(line - anchor.line, 0), span) / span;
  return anchor.top + (anchor.bottom - anchor.top) * through;
}

/**
 * The source line that best describes what is at `offset` in the rendered
 * document, or `null` when nothing is anchored.
 *
 * This exists to make scroll position survive a re-render: a pixel offset
 * means nothing once an edit has changed the document's height, but the line
 * it resolves to still points at the same content in the newly laid-out copy.
 *
 * Not the inverse of {@link lineToOffset}, despite the shape — `line → offset
 * → line` does not round-trip. Any element spanning several source lines
 * collapses them onto one box, and the two directions break ties differently.
 * It is a lossy best guess at "what is the reader looking at", which is all
 * restoration needs.
 *
 * It cannot reuse the other direction's index either — "which element is at
 * this height" is a spatial question, so it scans by position. Among the
 * elements straddling or following the offset it takes the topmost, and breaks
 * ties towards the earliest source line: with two columns side by side,
 * several elements share a `top`, and the earlier one is where the reader is.
 */
export function offsetToLine(
  anchors: readonly SourceAnchor[],
  offset: number,
): number | null {
  let best: SourceAnchor | null = null;
  for (const anchor of anchors) {
    // Straddling the offset wins outright: it is what fills the viewport top.
    const straddles = anchor.top <= offset && anchor.bottom > offset;
    const follows = anchor.top >= offset;
    if (!straddles && !follows) continue;
    if (
      !best ||
      anchor.top < best.top ||
      (anchor.top === best.top && anchor.line < best.line)
    ) {
      best = anchor;
    }
  }
  if (!best) {
    // Scrolled past every anchor — the tail of the document. Report the last
    // line we know about rather than nothing, so a reader sitting at the end
    // of a document stays at the end of it across a re-render.
    let last: SourceAnchor | null = null;
    for (const anchor of anchors) {
      if (!last || anchor.endLine > last.endLine) last = anchor;
    }
    return last ? last.endLine : null;
  }

  const span = best.bottom - best.top;
  if (span <= 0 || offset <= best.top) return best.line;
  const through = Math.min((offset - best.top) / span, 1);
  return best.line + Math.round((best.endLine - best.line) * through);
}

/** Index of the last anchor whose `line` is `<= line`, or -1. */
function lastAnchorAtOrBefore(
  anchors: readonly SourceAnchor[],
  line: number,
): number {
  let lo = 0;
  let hi = anchors.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].line <= line) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
