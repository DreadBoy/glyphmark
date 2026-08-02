import {
  lineToOffset,
  offsetToLine,
  parseGlyph,
  renderToHtml,
  type SourceAnchor,
} from '@glyphmark/core';
import { collectAnchors } from './anchors';

// The rendered document is a complete, self-contained HTML file (fonts and
// styles inlined, paged.js polyfill included). Dropping it into an iframe via
// `srcdoc` keeps its `<html>`/`<head>` intact and isolates its global styles
// from this shell page.
//
// `globalThis.document`, not `document`: the bundle is wrapped in a scope that
// shadows `document` with `undefined` so Emotion takes its server rendering
// path (see preview/esbuild.mjs). This file is the one part that really does
// want the shell page's DOM, so it opts back in explicitly.
const frame = globalThis.document.getElementById(
  'preview',
) as HTMLIFrameElement;

/**
 * Longest a single render is allowed to hold the loading indicator. Big books
 * legitimately take a while, so this is not a timeout on the work itself —
 * only a backstop so a wedged render can never leave the spinner up forever.
 */
const WATCHDOG_MS = 120_000;

const RENDERED_MESSAGE = 'glyphmark:rendered';

/**
 * paged.js lays pages out one at a time and the document is readable as soon as
 * the first one lands — but `after` only fires when the *last* one does, which
 * on a book-sized file is seconds later (measured: ~9ms per page, so ~1.8s at
 * 200 pages). Waiting for it leaves a spinner sitting over a perfectly readable
 * page, so the indicator comes down at `first-page` while `done` still drives
 * scroll restoration, which needs the full height to exist.
 */
type RenderPhase = 'first-page' | 'done';

/**
 * Incremented per render. Edits can arrive while a large document is still
 * paginating, so completion signals carry the token they belong to and stale
 * ones are ignored.
 */
let currentToken = 0;

/** Id of the style element that themes the area around the page. */
const BACKDROP_STYLE_ID = 'glyphmark-backdrop';

/**
 * Backdrop colour behind the rendered pages, kept in step with the IDE theme.
 * Seeded by the shell page and updated by the plugin when the theme changes.
 *
 * Only the area *around* the page is themed. The page itself stays white — it
 * is paper, and the document's own styles are the CLI's output, which the
 * preview otherwise reproduces exactly.
 */
let backdropColor = globalThis.window.__glyphmarkBackdrop ?? '#eeeeee';

function backdropCss(color: string): string {
  return `body { background: ${color}; }`;
}

/**
 * paged.js strips `<style>` elements from `<head>` unless they are marked
 * `media~="screen"`, so the override has to carry that attribute — the same
 * constraint the renderer's own page-shadow styles work around.
 */
function applyBackdropToFrame(): void {
  const doc = frame.contentDocument;
  if (!doc?.head) return;

  let style = doc.getElementById(BACKDROP_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = BACKDROP_STYLE_ID;
    style.setAttribute('media', 'screen');
    doc.head.appendChild(style);
  }
  style.textContent = backdropCss(backdropColor);
}

function setBackdrop(color: string): void {
  backdropColor = color;
  globalThis.document.body.style.background = color;
  applyBackdropToFrame();
}

function scrollTopOf(f: HTMLIFrameElement): number {
  try {
    return f.contentDocument?.scrollingElement?.scrollTop ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Scroll sync
//
// One way only: the editor drives the preview. Scrolling the preview is the
// reader looking somewhere on their own account — glancing at a table two
// pages down while the caret stays put — and yanking the editor after them
// would take the source out from under them for no reason they asked for.
// ---------------------------------------------------------------------------

/**
 * Anchors for the document currently in the frame, measured lazily and cached.
 *
 * Measuring costs a `getBoundingClientRect()` per anchored element, which is
 * far too much to repeat on every scroll event, and the numbers only move when
 * the layout does. `null` means "not measured yet"; anything that reflows the
 * document sets it back.
 */
let anchors: SourceAnchor[] | null = null;

/**
 * The line the editor last told us to show, held until there is a laid-out
 * document to show it in.
 *
 * The plugin can push a line while a large document is still paginating, and
 * anchors are only measurable once pagination has finished — so the request is
 * parked and applied at `done`. It doubles as scroll restoration across an
 * edit: restoring a *line* survives the document changing height, which the
 * raw `scrollTop` it replaces did not.
 */
let pendingLine: number | null = null;

/**
 * True from the moment a render is handed to the frame until paged.js reports
 * `done`. While it is set, anchors would describe a half-laid-out document, so
 * nothing resolves a line against them.
 */
let paginating = false;

function anchorsForFrame(): SourceAnchor[] {
  const doc = frame.contentDocument;
  if (!doc) return [];
  if (anchors === null) anchors = collectAnchors(doc);
  return anchors;
}

// ---------------------------------------------------------------------------
// Zoom
//
// Applied as CSS `zoom` on the frame's *body*, and only ever after pagination
// has finished. Both halves of that are load-bearing; see below.
// ---------------------------------------------------------------------------

/**
 * Current zoom, as an integer percentage. Kotlin owns this number — the toolbar
 * is its UI and the persisted state its home — and pushes it in; nothing here
 * reports it back, so the label cannot flicker on a round trip.
 *
 * Integer percent is the unit end to end, divided by 100 exactly once, at the
 * point the CSS is written.
 */
let zoomPercent = 100;

/** Whether the zoom is being recomputed from the frame width on every reflow. */
let fitWidth = false;

/**
 * The last factor [fitPercent] worked out, kept so that reporting the fit to
 * the plugin does not mean measuring it again.
 *
 * Measuring is not free of side effects — it drops the zoom to take its
 * readings — and the status payload goes out on every scroll, so recomputing
 * there put a layout thrash on the scroll path and, worse, the browser's
 * `scrollTop` clamp with it. The number only changes when the fit is actually
 * recomputed, so the cached one is what the toolbar wants anyway.
 */
let lastFitPercent = 0;

/**
 * Leaves the page shadow visible either side of the page at fit width, and
 * keeps the fit off by a hair rather than a hair over, which would put a
 * horizontal scrollbar on the frame.
 */
const FIT_GUTTER_PX = 8;

/**
 * The range a zoom level may take, mirroring the ends of `GlyphZoom.STOPS` on
 * the Kotlin side. Duplicated rather than shared because there is no way to
 * share a constant across the JVM/JavaScript boundary here; if the stop list
 * ever grows past these, both sides have to move together.
 */
const MIN_ZOOM_PERCENT = 25;
const MAX_ZOOM_PERCENT = 300;

/**
 * Zoom goes on `body`, never on `documentElement`.
 *
 * In standards mode `documentElement` *is* `scrollingElement`, and Chromium
 * adjusts a zoomed element's own `scrollTop`/`scrollHeight` by its effective
 * zoom while `getBoundingClientRect()` on its descendants is already in the
 * zoomed viewport space. `collectAnchors` adds those two together
 * (`rect.top + scrollTop`) and `glideTo` writes the result back to `scrollTop`,
 * so zooming the scroller would put the two halves of that sum in different
 * spaces and skew every anchor in proportion to (1 - zoom) — a silent scroll
 * sync misalignment, not a crash.
 *
 * Zooming `body` leaves the scroller at zoom 1. Layout still scales,
 * `scrollHeight` still grows, and `anchors.ts` needs no changes at all.
 *
 * The precondition for that, should this ever move: nothing between the zoomed
 * element and the scroller may carry zoom. Putting it on `.pagedjs_pages`
 * instead would keep the invariant; putting it back on `documentElement` would
 * not.
 */
function applyZoom(): void {
  // Never while paged.js is still laying pages out. Zoom applied mid-flight is
  // zoom applied *before* the remaining pages are measured, which is precisely
  // the case that moves page breaks — and it is reachable from the toolbar,
  // whose zoom buttons stay live during the seconds a book takes to paginate.
  //
  // Nothing is lost by refusing: `zoomPercent` already holds the new level, and
  // `restoreScroll` applies it at `done`.
  if (paginating) return;

  const doc = frame.contentDocument;
  if (!doc?.body) return;

  // `overflow-y: scroll` is pinned on documentElement permanently, not on body
  // and not only while fit is on. Not body, because body's overflow only
  // propagates to the viewport while documentElement's own is `visible` —
  // which would couple the fit arithmetic to whatever the renderer happens to
  // emit — and body is the zoomed element besides. Permanently, because a
  // conditional pin changes `clientWidth` when fit is toggled, so the displayed
  // percentage would jump on a toggle that changed nothing else. It also kills
  // the oscillation where zooming out removes the scrollbar, which widens the
  // available width, which refits, which brings the scrollbar back.
  if (doc.documentElement) doc.documentElement.style.overflowY = 'scroll';

  doc.body.style.zoom = zoomPercent === 100 ? '' : String(zoomPercent / 100);

  // The layout just moved under both caches.
  anchors = null;
  pageBoxes = null;
}

/**
 * The zoom at which one page fills the frame, as an integer percentage, or 0
 * when there is nothing to measure against.
 *
 * **Both numbers are measured with the zoom switched off**, and that is the
 * whole design. The obvious version measures the page at whatever zoom is
 * current and divides it back out — which requires knowing whether this
 * browser's `getBoundingClientRect()` and `clientWidth` report zoomed or
 * unzoomed values. That convention changed when CSS `zoom` was standardised,
 * and the Chromium inside JCEF does not necessarily match the one this was
 * developed against. Guessing wrong does not fail loudly: it returns a factor
 * that is off by the zoom, so every application of the fit compounds the error
 * — the page shrinking a little more on each click, and the fit disagreeing
 * with the panel after a resize.
 *
 * Measuring at zoom 1 asks the browser nothing about zoom. The ratio is between
 * two lengths taken in the same, unzoomed state, so it is correct under either
 * convention and — the property that matters — *idempotent*: fitting an
 * already-fitted page returns the same number.
 *
 * The reset and the restore happen inside one task with no paint between them,
 * so nothing flashes.
 */
function fitPercent(): number {
  // Half the pages of a half-paginated document are not there yet, and the ones
  // that are may still be resized. Measuring now would fit to a number that is
  // about to change; `restoreScroll` re-measures at `done`.
  if (paginating) return 0;

  const doc = frame.contentDocument;
  const scrolling = doc?.scrollingElement;
  if (!doc?.body || !scrolling) return 0;

  const page = doc.querySelector('.pagedjs_page');
  if (!page) return 0;

  const previous = doc.body.style.zoom;
  // Dropping the zoom makes the document shorter, and the browser *clamps*
  // `scrollTop` into the range that shorter document has — a clamp that putting
  // the zoom back does not undo. Left unrestored, the reader simply cannot
  // reach the end of the document: every attempt to scroll past roughly
  // (1 / zoom) of it gets pulled back.
  const scrollTop = scrolling.scrollTop;

  doc.body.style.zoom = '';
  // Both reads force layout, so both see the unzoomed state just written.
  const pageWidth = page.getBoundingClientRect().width;
  const available = scrolling.clientWidth - FIT_GUTTER_PX;

  doc.body.style.zoom = previous;
  if (scrolling.scrollTop !== scrollTop) scrolling.scrollTop = scrollTop;

  if (pageWidth <= 0 || available <= 0) return 0;

  // Clamped to the same bounds `GlyphZoom` enforces on the Kotlin side. Without
  // this the two disagree: a very narrow panel fits at, say, 12%, the page
  // renders at 12%, and the toolbar — which clamps on receipt — reads 25%. The
  // next Zoom In then steps from 25 to 50 and the view jumps.
  const percent = Math.round((available / pageWidth) * 100);
  lastFitPercent = Math.min(
    Math.max(percent, MIN_ZOOM_PERCENT),
    MAX_ZOOM_PERCENT,
  );
  return lastFitPercent;
}

/**
 * Pulls the zoom back if the page ended up wider than the panel after all.
 *
 * `scrollWidth` and `clientWidth` are both read off the scroller, which is
 * never the zoomed element, so their *ratio* is a true measure of how far the
 * content overhangs no matter how this browser reports zoomed geometry. That
 * makes this a check on the observed result rather than on the arithmetic that
 * produced it — the one thing that can catch a fit which is wrong for a reason
 * not thought of here.
 *
 * Only for fit. A reader who asks for 300% means to overflow.
 */
function correctFitOverflow(): void {
  const scrolling = frame.contentDocument?.scrollingElement;
  if (!scrolling || scrolling.clientWidth <= 0) return;

  const overhang = scrolling.scrollWidth / scrolling.clientWidth;
  // A hair over is rounding, not overflow.
  if (overhang <= 1.005) return;

  const corrected = Math.floor(zoomPercent / overhang);
  zoomPercent = Math.min(
    Math.max(corrected, MIN_ZOOM_PERCENT),
    MAX_ZOOM_PERCENT,
  );
  applyZoom();
  emitStatus();
}

/**
 * Recomputes and applies the fit zoom; a no-op when fit is off.
 *
 * A fit that comes out where it already was writes nothing. Dragging the split
 * divider fires a stream of these, and every zoom write is a reflow the reader
 * can feel — and one more chance for the scroll position to be clamped.
 */
function applyFit(): void {
  if (!fitWidth) return;
  const percent = fitPercent();
  if (percent <= 0 || percent === zoomPercent) return;
  zoomPercent = percent;
  applyZoom();
  correctFitOverflow();
}

/**
 * Called from the plugin when the reader picks a zoom level. Turns fit off:
 * choosing a number is choosing not to track the width.
 */
function setZoom(percent: number): void {
  fitWidth = false;
  changeZoomKeepingPlace(percent);
}

/** Called from the plugin when the fit-to-width toggle changes. */
function setFitWidth(enabled: boolean): void {
  fitWidth = enabled;
  if (!enabled) {
    emitStatus();
    return;
  }
  const percent = fitPercent();
  if (percent <= 0) {
    emitStatus();
    return;
  }
  changeZoomKeepingPlace(percent);
  correctFitOverflow();
}

/**
 * Zooming should leave the reader looking at the same *text*, not at the same
 * pixel offset — which is a different part of the document once everything has
 * changed size. So the line at the top of the viewport is read off the old
 * layout and restored against the new one, without animation: the reader has
 * not asked to be moved.
 */
function changeZoomKeepingPlace(percent: number): void {
  const scrolling = frame.contentDocument?.scrollingElement;
  const line =
    scrolling && !paginating
      ? offsetToLine(anchorsForFrame(), scrolling.scrollTop)
      : null;

  zoomPercent = percent;
  applyZoom();

  if (line !== null) {
    pendingLine = line;
    applyPendingLine(false);
  }
  emitStatus();
}

// ---------------------------------------------------------------------------
// Pages
//
// The toolbar shows "page N of M" and jumps to a page, so the plugin needs both
// numbers. They are derived here, where the laid-out document is.
// ---------------------------------------------------------------------------

/**
 * Vertical extent of every `.pagedjs_page`, in document space, measured lazily
 * and cached exactly like [anchors].
 *
 * Without the cache, resolving the current page would mean a
 * `getBoundingClientRect()` per page on every scroll frame — 200 of them on a
 * book, which is the precise cost the anchor cache exists to avoid.
 */
let pageBoxes: { top: number; bottom: number }[] | null = null;

/**
 * A page jump that arrived while the document was still paginating, held until
 * there are pages to count. Same shape and the same reason as [pendingLine],
 * and step 5 of `restoreScroll` resolves whichever is set.
 */
let pendingPage: number | null = null;

/** Longest a burst of scrolling may go without the plugin hearing about it. */
const STATUS_COALESCE_MS = 100;

function pageBoxesForFrame(): { top: number; bottom: number }[] {
  const doc = frame.contentDocument;
  const scrolling = doc?.scrollingElement;
  if (!doc || !scrolling) return [];
  if (pageBoxes === null) {
    const scrollTop = scrolling.scrollTop;
    pageBoxes = [...doc.querySelectorAll('.pagedjs_page')].map((page) => {
      const rect = page.getBoundingClientRect();
      return { top: rect.top + scrollTop, bottom: rect.bottom + scrollTop };
    });
  }
  return pageBoxes;
}

/**
 * 1-based number of the page the reader is looking at: **the page showing the
 * most of itself in the viewport.**
 *
 * "Which page am I on" has several defensible readings, so this one is written
 * down rather than left to be re-derived. The obvious alternative — the last
 * page whose top edge has passed the top of the viewport — was tried first and
 * is too brittle to use: a jump to page 5 lands a few pixels short of its top
 * often enough to matter (the eased scroll finishes on a sub-pixel boundary),
 * and the field then says 4 while the reader is plainly looking at page 5. Any
 * fix for that is a tolerance constant tuned to the symptom.
 *
 * Largest-visible-area needs no such constant, and it is also the right answer
 * at low zoom, where several whole pages are on screen at once.
 *
 * The scan is bounded by the number of *visible* pages, not the document
 * length: the binary search finds the first page reaching into the viewport,
 * and the loop stops at the first one past its bottom edge.
 */
function currentPage(): number {
  const scrolling = frame.contentDocument?.scrollingElement;
  const boxes = pageBoxesForFrame();
  if (!scrolling || boxes.length === 0) return 1;

  const viewportTop = scrolling.scrollTop;
  const viewportBottom = viewportTop + scrolling.clientHeight;

  // First page whose bottom edge is below the top of the viewport — i.e. the
  // first one with anything to show.
  let low = 0;
  let high = boxes.length - 1;
  let first = boxes.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (boxes[middle].bottom > viewportTop) {
      first = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  let best = first;
  let bestVisible = -1;
  for (let index = first; index < boxes.length; index++) {
    const box = boxes[index];
    if (box.top >= viewportBottom) break;
    const visible =
      Math.min(box.bottom, viewportBottom) - Math.max(box.top, viewportTop);
    if (visible > bestVisible) {
      bestVisible = visible;
      best = index;
    }
  }
  return best + 1;
}

/** Last payload sent, so an unchanged one is not pushed across the bridge. */
let lastStatus: string | null = null;
let statusTimer: number | null = null;

/**
 * Tells the plugin where the reader is and how many pages there are.
 *
 * Always three fields, so the Kotlin parser has no branch: current page, page
 * count, and the fit percentage — 0 meaning "not applicable", either because
 * fit is off or because there is nothing to measure. The fit factor is the one
 * number the plugin cannot work out for itself, which is why it travels back;
 * the zoom level does not, because Kotlin owns it.
 */
function emitStatus(): void {
  // Mid-pagination the page list describes only however much has been laid out
  // so far, so "page 3 of 4" would be true for a moment and wrong immediately.
  if (paginating) return;

  // Both numbers come off the same cached measurement, so the payload cannot
  // report a page out of a count that disagrees with it.
  const count = pageBoxesForFrame().length;
  // The cached factor, never a fresh measurement: this runs on every scroll,
  // and measuring has side effects on layout and scroll position.
  const payload = `${currentPage()}|${count}|${fitWidth ? lastFitPercent : 0}`;
  if (payload === lastStatus) return;
  lastStatus = payload;
  globalThis.window.glyphmarkStatus?.(payload);
}

/**
 * Coalesced like the editor-side scroll bridge, and for the same reason: every
 * push crosses the JCEF process boundary, and a scroll produces far more events
 * than a toolbar label can usefully show.
 */
function scheduleStatus(): void {
  if (statusTimer !== null) return;
  statusTimer = globalThis.setTimeout(() => {
    statusTimer = null;
    emitStatus();
  }, STATUS_COALESCE_MS);
}

/** Called from the plugin when the reader asks for a particular page. */
function goToPage(page: number): void {
  pendingPage = page;
  applyPendingPage();
}

function applyPendingPage(): void {
  if (pendingPage === null) return;
  if (paginating) return;

  const scrolling = frame.contentDocument?.scrollingElement;
  if (!scrolling) return;

  const boxes = pageBoxesForFrame();
  if (boxes.length === 0) {
    // Nothing to jump to — an error page, or a document that never paginated.
    // Drop the request rather than park it forever; the page numbers the reader
    // typed it against do not exist.
    pendingPage = null;
    return;
  }

  const index = Math.min(Math.max(pendingPage, 1), boxes.length) - 1;
  pendingPage = null;
  // Eases rather than jumps, so a page jump reads like every other movement in
  // the preview.
  glideTo(boxes[index].top);
  scheduleStatus();
}

/**
 * Fraction of the remaining distance covered per 60Hz frame, the reference
 * frame time that fraction is quoted against, and the distance at which the
 * glide stops chasing and snaps.
 *
 * 0.18 per frame is a ~5-frame time constant: quick enough not to feel like
 * lag, slow enough that the eye can follow the page rather than being
 * teleported and having to re-find its place. It is converted to the real
 * elapsed time each frame, because a fixed fraction per frame would glide
 * twice as fast on a 120Hz display as on a 60Hz one.
 */
const SCROLL_EASING_PER_FRAME = 0.18;
const REFERENCE_FRAME_MS = 1000 / 60;
const SCROLL_SNAP_PX = 0.5;

/** Where the glide is heading, and the frame callback driving it. */
let scrollTarget: number | null = null;
let scrollFrame: number | null = null;

/**
 * Eases the preview towards `offset` instead of jumping to it.
 *
 * IntelliJ's own Markdown preview gets its smoothness from
 * `scrollIntoView({ behavior: 'smooth' })`, but that restarts from scratch on
 * every call — so it has to ignore any update whose target is still inside the
 * element it is already scrolling to, or a stream of them stutters. That guard
 * is element-granular, which would throw away the whole point of emitting an
 * end line: scrolling through a forty-line `item()` block would sit still,
 * because every one of those lines is "the element we are already at".
 *
 * A hand-rolled ease has no such problem. Re-targeting mid-flight is free —
 * the running loop simply reads the new goal on its next frame — so a
 * continuous editor scroll becomes continuous preview movement rather than a
 * series of restarted animations.
 */
function glideTo(offset: number): void {
  scrollTarget = offset;
  if (scrollFrame !== null) return;

  let previousTime: number | null = null;

  const step = (now: number) => {
    const scrolling = frame.contentDocument?.scrollingElement;
    if (!scrolling || scrollTarget === null) {
      stopGliding();
      return;
    }

    // `scrollTop` silently clamps to the scrollable range on assignment, so a
    // target past the end of the document can never be reached. Without
    // clamping it here the distance would never shrink, the loop would never
    // terminate, and — far worse — it would keep writing `scrollTop` every
    // frame, overwriting any attempt by the reader to scroll the preview back.
    // Aiming a line near the end of the document at the top of the viewport
    // asks for exactly that, so this is the common case, not a corner.
    const limit = Math.max(0, scrolling.scrollHeight - scrolling.clientHeight);
    const target = Math.min(Math.max(scrollTarget, 0), limit);

    const before = scrolling.scrollTop;
    const distance = target - before;
    if (Math.abs(distance) < SCROLL_SNAP_PX) {
      scrolling.scrollTop = target;
      stopGliding();
      return;
    }

    // Same easing per unit of *time* rather than per frame, so the glide takes
    // as long on a 120Hz display as on a 60Hz one.
    const elapsed =
      previousTime === null ? REFERENCE_FRAME_MS : now - previousTime;
    previousTime = now;
    const eased =
      1 - Math.pow(1 - SCROLL_EASING_PER_FRAME, elapsed / REFERENCE_FRAME_MS);
    scrolling.scrollTop = before + distance * eased;

    // Belt and braces: if a frame moved us nowhere despite wanting to, the
    // scroll position is pinned by something we cannot see. Stop rather than
    // spin.
    if (scrolling.scrollTop === before) {
      stopGliding();
      return;
    }
    scrollFrame = globalThis.requestAnimationFrame(step);
  };
  scrollFrame = globalThis.requestAnimationFrame(step);
}

function stopGliding(): void {
  if (scrollFrame !== null) globalThis.cancelAnimationFrame(scrollFrame);
  scrollFrame = null;
  scrollTarget = null;
}

/**
 * The reader taking hold of the preview wins.
 *
 * Sync is one-way by design, so a glide that kept running while someone was
 * scrolling the preview themselves would be the editor overriding them — the
 * one thing this feature is supposed not to do. Re-attached per document,
 * since `srcdoc` replaces it.
 */
function watchUserScroll(doc: Document): void {
  for (const event of ['wheel', 'touchstart', 'mousedown', 'keydown']) {
    doc.addEventListener(event, stopGliding, { passive: true });
  }
}

/** Called from the plugin when the source editor scrolls. */
function scrollToLine(line: number): void {
  pendingLine = line;
  applyPendingLine(true);
}

/**
 * `animate` is false for scroll *restoration* after a re-render: the reader is
 * already where they were, and easing there from wherever a fresh document
 * starts would be a scroll they never asked for.
 */
function applyPendingLine(animate: boolean): void {
  if (pendingLine === null) return;

  // Anchors measured while paged.js is still laying pages out describe only
  // the part of the document that exists so far, so a line resolved against
  // them lands somewhere arbitrary — and, having been applied, would no longer
  // be pending when `done` arrives with the real layout. Hold it instead.
  if (paginating) return;

  const scrolling = frame.contentDocument?.scrollingElement;
  if (!scrolling) return;

  const offset = lineToOffset(anchorsForFrame(), pendingLine);
  // Nothing anchored at all — an error page, or a document that never
  // paginated. Leave the request parked; there is nothing better to do with it.
  if (offset === null) return;
  pendingLine = null;

  if (animate) {
    glideTo(offset);
  } else {
    stopGliding();
    scrolling.scrollTop = offset;
  }
}

/**
 * Anchor positions are measured in document space, so they survive scrolling
 * but not a reflow. Resizing the split re-flows the frame's contents, so the
 * cache is dropped and re-measured on next use.
 */
function watchFrameResize(): void {
  const observer = new globalThis.ResizeObserver(() => {
    onFrameResized();
  });
  observer.observe(frame);
}

/**
 * A narrower frame means a different fit, and the whole point of fit is that it
 * tracks the width rather than being a zoom the reader reapplies after every
 * drag of the split divider.
 */
function onFrameResized(): void {
  anchors = null;
  pageBoxes = null;
  applyFit();
  scheduleStatus();
}

/**
 * The frame's *own* resize event, which is the authoritative one.
 *
 * The `ResizeObserver` above watches the iframe element from the shell page and
 * fires as soon as that box changes — which can be before the document inside
 * has been laid out at the new size, so a fit computed there can measure the
 * old viewport width and land on a factor for a panel size that no longer
 * exists. The inner `resize` event fires after the inner viewport has actually
 * changed, so it always measures the real thing.
 *
 * Both are kept, and that is safe precisely because the fit is idempotent:
 * running it twice for one drag lands on the same number.
 */
function watchInnerResize(view: Window): void {
  view.addEventListener('resize', onFrameResized, { passive: true });
}

function renderError(message: string): string {
  const escaped = message.replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string,
  );
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>
    body { margin: 0; padding: 24px; font: 13px ui-monospace, monospace;
           color: #c75450; background: transparent; white-space: pre-wrap; }
  </style></head><body>${escaped}</body></html>`;
}

/**
 * Teach the rendered document to report when pagination has finished.
 *
 * paged.js reads `window.PagedConfig` once, as its polyfill script initialises,
 * and awaits `after()` when it is done laying pages out. So the hook has to be
 * in the document *before* the polyfill runs — hence injecting it into `<head>`
 * rather than reaching into the frame after load.
 *
 * This matters because the iframe's own `load` event fires when the source HTML
 * is parsed, which for a big book is long before it is readable. Hiding the
 * indicator there would defeat the point.
 */
function withCompletionHook(html: string, token: number): string | null {
  const headTag = '<head>';
  const at = html.indexOf(headTag);
  if (at === -1) return null;

  const message = JSON.stringify(RENDERED_MESSAGE);
  const hook =
    `<script>(function () {` +
    `  var post = function (phase) {` +
    `    parent.postMessage({ type: ${message}, token: ${token}, phase: phase }, '*');` +
    `  };` +
    `  var sawFirstPage = false;` +
    `  window.PagedConfig = {` +
    `    auto: true,` +
    // `before` runs after the polyfill has published `window.Paged`, which is
    // the earliest point a per-page handler can be registered.
    `    before: function () {` +
    `      window.Paged.registerHandlers(class extends window.Paged.Handler {` +
    `        afterPageLayout() {` +
    `          if (sawFirstPage) return;` +
    `          sawFirstPage = true;` +
    `          post('first-page');` +
    `        }` +
    `      });` +
    `    },` +
    `    after: function () { post('done'); }` +
    `  };` +
    `})();</script>`;

  const withHook =
    html.slice(0, at + headTag.length) + hook + html.slice(at + headTag.length);

  // Appended at the *end* of head so it wins over the renderer's own
  // `body { background: #eee }`, which is emitted there.
  const backdrop = `<style media="screen" id="${BACKDROP_STYLE_ID}">${backdropCss(backdropColor)}</style>`;
  const closeHead = '</head>';
  const closeAt = withHook.indexOf(closeHead);
  if (closeAt === -1) return withHook;

  return withHook.slice(0, closeAt) + backdrop + withHook.slice(closeAt);
}

/** Reports back to the plugin so it can take the loading indicator down. */
function notifyRendered(token: number, phase: RenderPhase): void {
  if (token !== currentToken) return;
  globalThis.window.glyphmarkRenderComplete?.(phase);
}

/**
 * Entry point called from the plugin (Kotlin) side on every debounced edit.
 * Kotlin passes the raw .glyph source; parsing and rendering both happen here,
 * reusing the exact same @glyphmark/core code path as the CLI.
 */
function render(source: string): void {
  const token = ++currentToken;
  const previousScroll = scrollTopOf(frame);

  // The outgoing document's anchors describe a layout that is about to be
  // thrown away; the line they resolve to is what carries over. Measured
  // before `paginating` is set, since this is still the finished old document.
  if (pendingLine === null) {
    pendingLine = offsetToLine(anchorsForFrame(), previousScroll);
  }
  anchors = null;
  pageBoxes = null;
  // A jump parked against the outgoing document is a page number in a
  // pagination that no longer exists — the new one may not even have that many
  // pages. Dropping it leaves the reader where they were, which is what the
  // line-based restore below is for.
  pendingPage = null;
  paginating = true;
  // The page numbers in the outgoing document are about to stop meaning
  // anything, but the status is not re-emitted until `done` — a count taken
  // mid-pagination would be true for a moment and wrong immediately.
  lastStatus = null;

  let html: string;
  let failed = false;
  try {
    html = renderToHtml(parseGlyph(source), { sourceAnchors: true });
  } catch (error) {
    failed = true;
    html = renderError(
      error instanceof Error
        ? `${error.message}\n\n${error.stack ?? ''}`
        : String(error),
    );
  }

  // Prefer putting the reader back on the *line* they were on; fall back to
  // the raw offset when there is nothing to resolve it against — an error
  // page carries no anchors, and neither does a document that failed to
  // paginate.
  const restoreScroll = () => {
    // Cleared unconditionally and first: a render that produced nothing
    // measurable must still not leave later pushes parked forever.
    paginating = false;
    const scrolling = frame.contentDocument?.scrollingElement;
    if (!scrolling) {
      emitStatus();
      return;
    }

    // Zoom goes on *after* pagination, always.
    //
    // Measured, before this was written: a 31-page document paginated with the
    // zoom already set on body comes out as 16 pages at 50% and 21 at 67% —
    // paged.js sizes the page box from unzoomed computed styles while the
    // content inside it shrinks, so far more fits on a page. Zooming in happens
    // to be stable (31 pages at both 150% and 300%), but zooming out is the
    // direction fit-to-width lands in, and moving a page break would break the
    // one thing this preview promises: that it shows what the CLI writes.
    //
    // The cost is that the reader sees an unzoomed page for as long as
    // pagination takes — the indicator comes down at `first-page`, deliberately,
    // long before `done`. That flash is accepted. Holding the indicator until
    // `done` whenever zoom is on was the alternative, and it trades a flash for
    // a stall on every keystroke, which is worse.
    applyFit();
    applyZoom();

    anchors = null;
    pageBoxes = null;

    // An explicit jump outranks scroll restoration: the reader asked for a page,
    // where a parked line is only where they happened to be. Both can be set at
    // once — typing an edit while a jump is parked does it — so the precedence
    // is stated rather than left to whichever branch runs first.
    if (pendingPage !== null) {
      pendingLine = null;
      applyPendingPage();
    } else if (
      pendingLine !== null &&
      lineToOffset(anchorsForFrame(), pendingLine) !== null
    ) {
      applyPendingLine(false);
    } else {
      stopGliding();
      scrolling.scrollTop = previousScroll;
    }
    pendingLine = null;
    emitStatus();
  };

  // Error pages carry no paged.js, so there is nothing to wait for beyond load.
  const instrumented = failed ? null : withCompletionHook(html, token);

  if (instrumented === null) {
    // Error pages carry no paged.js, so load is both first paint and done.
    frame.addEventListener(
      'load',
      () => {
        restoreScroll();
        notifyRendered(token, 'first-page');
        notifyRendered(token, 'done');
      },
      { once: true },
    );
  } else {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        token?: number;
        phase?: RenderPhase;
      } | null;
      if (data?.type !== RENDERED_MESSAGE || data.token !== token) return;

      if (data.phase === 'first-page') {
        notifyRendered(token, 'first-page');
        return;
      }

      globalThis.window.removeEventListener('message', onMessage);
      // Only safe once every page exists, so the full scroll height is known.
      restoreScroll();
      notifyRendered(token, 'done');
    };
    globalThis.window.addEventListener('message', onMessage);
    globalThis.setTimeout(() => {
      globalThis.window.removeEventListener('message', onMessage);
      // Only for the render this watchdog belongs to. Two minutes of editing a
      // large document is an ordinary session, so by the time this fires the
      // document in the frame is routinely a much later one — and clearing
      // `paginating` for *that* render would hand out anchors and a page count
      // measured against a half-laid-out document.
      if (token !== currentToken) return;
      // A wedged render must not leave scroll sync switched off for the rest
      // of the session.
      paginating = false;
      // Whatever did make it into the frame is what the reader is looking at,
      // so the zoom belongs on it and the toolbar should describe it rather
      // than keep numbers from the document before.
      applyZoom();
      emitStatus();
      notifyRendered(token, 'done');
    }, WATCHDOG_MS);
  }

  frame.srcdoc = instrumented ?? html;
}

declare global {
  interface Window {
    glyphmarkRender: (source: string) => void;
    /** Injected by the plugin over the JCEF query bridge. */
    glyphmarkRenderComplete?: (phase: RenderPhase) => void;
    /**
     * Injected by the plugin over a second JCEF query bridge. Carries
     * `"<currentPage>|<pageCount>|<fitPercent>"`; see [emitStatus].
     */
    glyphmarkStatus?: (payload: string) => void;
    /** Called by the plugin on startup and whenever the IDE theme changes. */
    glyphmarkSetBackdrop: (color: string) => void;
    /** Called by the plugin when the source editor scrolls. */
    glyphmarkScrollToLine: (line: number) => void;
    /** Called by the plugin from the toolbar's zoom controls. */
    glyphmarkSetZoom: (percent: number) => void;
    /** Called by the plugin when the fit-to-width toggle changes. */
    glyphmarkSetFitWidth: (enabled: boolean) => void;
    /** Called by the plugin from the toolbar's page field. */
    glyphmarkGoToPage: (page: number) => void;
    /** Seeded by the shell page so the first paint is already themed. */
    __glyphmarkBackdrop?: string;
  }
}

globalThis.window.glyphmarkRender = render;
globalThis.window.glyphmarkSetBackdrop = setBackdrop;
globalThis.window.glyphmarkScrollToLine = scrollToLine;
globalThis.window.glyphmarkSetZoom = setZoom;
globalThis.window.glyphmarkSetFitWidth = setFitWidth;
globalThis.window.glyphmarkGoToPage = goToPage;

// Every `srcdoc` assignment replaces the frame's document, so the anchors
// measured from the old one describe a layout that no longer exists.
frame.addEventListener('load', () => {
  anchors = null;
  pageBoxes = null;
  // The glide was aimed at a layout that no longer exists.
  stopGliding();
  const doc = frame.contentDocument;
  if (!doc) return;
  watchUserScroll(doc);
  // Re-attached per document for the same reason `watchUserScroll` is: the
  // listener belongs to a document that `srcdoc` has just thrown away.
  doc.addEventListener('scroll', scheduleStatus, { passive: true });
  if (doc.defaultView) watchInnerResize(doc.defaultView);
});
watchFrameResize();
