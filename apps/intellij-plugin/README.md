# Glyphmark IntelliJ plugin

Live preview for `.glyph` files in IntelliJ IDEA, in the same shape the bundled
Markdown plugin uses: a split editor with the source on the left and the
rendered document on the right.

Powered by [`@glyphmark/core`](../../libs/core) — the preview goes through the
same parser and renderer as [the CLI](../cli), so what you see in the editor is
what `glyphmark input.glyph output.html` writes.

## How it renders

The preview panel is a JCEF (embedded Chromium) browser, and rendering happens
*inside* it. `@glyphmark/core` is pure browser-compatible JavaScript — no Node
built-ins — so it is bundled with esbuild into `preview/bundle.js`, shipped as a
plugin resource, and inlined into a shell page that the panel loads.

On every edit the plugin debounces for 300 ms, passes the raw source into the
page, and the bundle parses it and drops the resulting self-contained HTML into
an `<iframe srcdoc>`. Scroll position is preserved across re-renders.

Large documents take a noticeable moment, so the panel shows the IDE's standard
loading indicator (`JBLoadingPanel`) once a render passes 200 ms — short renders
never flash a spinner. The indicator is deliberately a Swing overlay rather than
anything in the page: rendering blocks the browser's JavaScript thread, so an
in-page spinner would freeze, while the EDT keeps animating. The page reports
completion back over a `JBCefJSQuery` bridge.

That bridge reports two phases, because neither obvious signal is the right one.
The iframe's `load` event is far too early — it fires before a single page is
laid out. But paged.js's `PagedConfig.after` is too late: it waits for the *last*
page, and pagination costs roughly 9 ms per page, so on a 200-page document it
sits there for nearly two seconds over an already-readable preview. So the
indicator comes down on `first-page` (a paged.js `afterPageLayout` handler,
registered from `before` where `window.Paged` first exists), while `done` still
drives scroll restoration, which needs the final height to exist.

The area around the page is painted with the editor's background colour, so the
preview does not glare white in a dark theme, and it follows along when the
theme changes (`EditorColorsManager.TOPIC`). The page itself deliberately stays
white — it is paper, and its styles are the renderer's output.

Note that pagination continues after the indicator lifts, and it runs on the
page's main thread — so on a very large book the panel repaints lazily for a few
seconds while pages accumulate. Rendering itself is not the cost here
(`renderToHtml` is ~140 ms on a 200-page document); pagination is.

This means the plugin needs **no Node installation** and spawns **no helper
process** — the preview panel is already a JavaScript engine, so it is the one
doing the work.

One subtlety is worth knowing before touching `preview/esbuild.mjs`:
`renderToHtml` is a *server-side* renderer, and Emotion decides at runtime
whether it is running on a server by testing `typeof document !== 'undefined'`.
In a browser that is always true, so Emotion writes styles into the live
document and the extraction step returns nothing — yielding perfectly correct
markup with empty `<style>` tags. The bundle therefore wraps itself in a scope
that shadows `document`, and `preview/src/index.ts` reaches the real DOM through
`globalThis`. The build is checked against Node's output byte-for-byte, so if
this ever regresses the HTML simply stops matching.

Two consequences worth knowing:

- The renderer emits an `@import` for Google Fonts, so the preview needs network
  access to show the rulebook typefaces. Offline, it falls back to system fonts;
  layout is otherwise unaffected.
- `renderToPdf` is not available here. It needs Playwright, which is Node-only;
  the bundle stubs it out. Use the CLI for PDFs.

## Development

Gradle drives the plugin build, and Nx wraps it so it behaves like every other
project in the workspace. The Gradle wrapper is checked in — no local Gradle
installation is needed.

```bash
# build the plugin zip (builds @glyphmark/core and the preview bundle first)
npx nx build intellij-plugin

# launch a sandbox IDE with the plugin installed
npx nx run intellij-plugin:run

# rebuild only the preview bundle after changing libs/core
npx nx build-preview intellij-plugin
```

The installable artifact lands in `build/distributions/`.

Gradle tasks can also be run directly from this directory (`./gradlew runIde`),
but going through Nx is preferable — it rebuilds `@glyphmark/core` and the
preview bundle first, which `./gradlew` alone will not do.

## Layout

| Path                            | What it is                                                        |
| ------------------------------- | ----------------------------------------------------------------- |
| `src/main/kotlin/`              | The plugin: file type, editor provider, JCEF preview editor.       |
| `preview/src/index.ts`          | The code that runs inside the preview browser.                     |
| `preview/esbuild.mjs`           | Bundles `@glyphmark/core` for the browser.                         |
| `src/main/resources/preview/`   | Generated bundle. Not checked in.                                  |

## Scope

This first version is preview only. `.glyph` files are registered against plain
text, so there is no Glyph-specific syntax highlighting, completion, or
structure view — adding those means introducing a real `Language` with a lexer
and parser definition.
