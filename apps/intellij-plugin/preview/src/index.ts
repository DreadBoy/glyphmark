import { parseGlyph, renderToHtml } from '@glyphmark/core';

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
  const backdrop =
    `<style media="screen" id="${BACKDROP_STYLE_ID}">${backdropCss(backdropColor)}</style>`;
  const closeHead = '</head>';
  const closeAt = withHook.indexOf(closeHead);
  if (closeAt === -1) return withHook;

  return (
    withHook.slice(0, closeAt) + backdrop + withHook.slice(closeAt)
  );
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

  let html: string;
  let failed = false;
  try {
    html = renderToHtml(parseGlyph(source));
  } catch (error) {
    failed = true;
    html = renderError(
      error instanceof Error
        ? `${error.message}\n\n${error.stack ?? ''}`
        : String(error),
    );
  }

  const restoreScroll = () => {
    const scrolling = frame.contentDocument?.scrollingElement;
    if (scrolling) scrolling.scrollTop = previousScroll;
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
    /** Seeded by the shell page so the first paint is already themed. */
    __glyphmarkBackdrop?: string;
  }
}

globalThis.window.glyphmarkRender = render;
globalThis.window.glyphmarkSetBackdrop = setBackdrop;
