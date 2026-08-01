import { LINE_ATTR, END_LINE_ATTR, type SourceAnchor } from '@glyphmark/core';

/**
 * Reads the source anchors the renderer emitted back out of the paginated
 * document (see `libs/core/src/renderer/source-anchors.ts` for the contract).
 *
 * `doc` is passed in rather than reached for: the preview bundle is wrapped in
 * a scope that shadows the global `document` with `undefined` so Emotion takes
 * its server path (see `preview/esbuild.mjs`), and TypeScript will not warn
 * about it — `lib.dom` still declares the global, so a bare `document` here
 * type-checks and then throws at runtime. Nothing in this module touches a
 * global; that is the whole reason it is a module.
 *
 * That anchors survive pagination at all is the load-bearing assumption:
 * paged.js *moves* the rendered nodes into its page boxes rather than
 * recreating them, so the attributes ride along and the elements still
 * measure.
 */
export function collectAnchors(doc: Document): SourceAnchor[] {
  const scrolling = doc.scrollingElement;
  if (!scrolling) return [];
  const scrollTop = scrolling.scrollTop;

  // Once paged.js has run, the laid-out content lives under `.pagedjs_pages`
  // and the original source tree is no longer what the reader sees. Scoping to
  // it keeps any leftover copy out of the table; before pagination (and on the
  // error page, which carries no paged.js at all) the document itself is the
  // only tree there is.
  const root: ParentNode = doc.querySelector('.pagedjs_pages') ?? doc;

  // `:not([data-split-from])` drops the continuation half of an element
  // paged.js broke across a page boundary. Both halves carry the same
  // `data-glyph-line`, and the first one is the one the line actually starts
  // at — keeping the continuation would leave the binary search in
  // `lineToOffset` landing on the overflow rather than the start.
  //
  // `querySelectorAll` yields document order, which is source order — the
  // invariant `lineToOffset` binary searches on. The result is deliberately
  // *not* re-sorted by vertical position; see `lineToOffset` in core for why
  // position is not monotonic in source order.
  const elements = root.querySelectorAll<HTMLElement>(
    `[${LINE_ATTR}]:not([data-split-from])`,
  );

  const anchors: SourceAnchor[] = [];
  for (const element of elements) {
    const line = Number(element.getAttribute(LINE_ATTR));
    const endLine = Number(element.getAttribute(END_LINE_ATTR) ?? line);
    if (!Number.isFinite(line) || line < 1) continue;

    const rect = element.getBoundingClientRect();
    anchors.push({
      line,
      endLine: Number.isFinite(endLine) && endLine >= line ? endLine : line,
      top: rect.top + scrollTop,
      bottom: rect.bottom + scrollTop,
    });
  }
  return anchors;
}
