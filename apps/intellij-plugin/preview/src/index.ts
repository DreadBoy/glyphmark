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
    anchors = null;
  });
  observer.observe(frame);
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
  paginating = true;

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
    if (!scrolling) return;
    anchors = null;
    if (
      pendingLine !== null &&
      lineToOffset(anchorsForFrame(), pendingLine) !== null
    ) {
      applyPendingLine(false);
    } else {
      stopGliding();
      scrolling.scrollTop = previousScroll;
    }
    pendingLine = null;
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
      // A wedged render must not leave scroll sync switched off for the rest
      // of the session.
      paginating = false;
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
    /** Called by the plugin on startup and whenever the IDE theme changes. */
    glyphmarkSetBackdrop: (color: string) => void;
    /** Called by the plugin when the source editor scrolls. */
    glyphmarkScrollToLine: (line: number) => void;
    /** Seeded by the shell page so the first paint is already themed. */
    __glyphmarkBackdrop?: string;
  }
}

globalThis.window.glyphmarkRender = render;
globalThis.window.glyphmarkSetBackdrop = setBackdrop;
globalThis.window.glyphmarkScrollToLine = scrollToLine;

// Every `srcdoc` assignment replaces the frame's document, so the anchors
// measured from the old one describe a layout that no longer exists.
frame.addEventListener('load', () => {
  anchors = null;
  // The glide was aimed at a layout that no longer exists.
  stopGliding();
  const doc = frame.contentDocument;
  if (doc) watchUserScroll(doc);
});
watchFrameResize();
