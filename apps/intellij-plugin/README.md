# Glyphmark IntelliJ plugin

Live preview for `.glyph` files in IntelliJ IDEA, in the same shape the bundled
Markdown plugin uses: a split editor with the source on the left and the
rendered document on the right.

Powered by [`@glyphmark/core`](../../libs/core) — the preview goes through the
same parser and renderer as [the CLI](../cli), so what you see in the editor is
what `glyphmark input.glyph output.html` writes.

The **Structure** tool window (<kbd>⌘7</kbd> / <kbd>Alt+7</kbd>, or <kbd>⌘F12</kbd>
for the popup) outlines the open document: headings nested by level, with
`item()`, `info()`, `rule()`, `sample()` and `head()` blocks listed under the
heading they follow. A block is labelled by its leading `#` name and `##`
subtitle, the way the parser reads them, so a feat shows up as **Pet · Feat 1**
rather than as `item`. Content-ref definitions (`key { … }`) are listed too.

The outline comes from [`GlyphOutline`](src/main/kotlin/com/glyphmark/intellij/GlyphOutline.kt),
a line scanner that mirrors the lexer's block and heading patterns — the IDE
can't run the TypeScript parser on the JVM, and an outline only needs the
document's skeleton.

## Editing actions

The everyday markup edits live under <kbd>Edit</kbd> → <kbd>Glyph</kbd> and on
the editor's context menu. They apply to the selection, or to the word under the
caret when there is none.

| Action                  | Shortcut                          | What it does                |
| ----------------------- | --------------------------------- | --------------------------- |
| Bold                    | <kbd>⌘B</kbd> / <kbd>Ctrl+B</kbd> | Toggles `**text**`           |
| Italic                  | <kbd>⌘I</kbd> / <kbd>Ctrl+I</kbd> | Toggles `*text*`             |
| Superscript / Subscript | —                                 | Toggles `^text^` / `~text~`  |

Two things about them are specific to the language rather than to Markdown
habit, and are worth knowing:

- **Emphasis rewrites the run instead of nesting it.** The parser keeps a `*`
  inside `**…**` literal, so combined emphasis is only ever the triple form:
  bolding `*text*` yields `***text***`, not a bold pair around the italic one.
  That is also why there is no separate bold-italic action — the two toggles
  compose to `***text***` on their own, from either direction.
- **Each line is wrapped separately.** Glyph emphasis never spans a newline, yet
  a source paragraph routinely does — the lexer joins its lines back together —
  so bolding a sentence that wraps produces one pair of delimiters per line.

Pressing <kbd>Enter</kbd> inside a list carries the bullet onto the next line,
reusing the marker character and any leading indent. Enter on a bullet with
nothing after it removes the bullet instead, which is how you leave the list. A
lone `-` is left alone — the lexer reads that as an hr, not a list item — and so
is a marker followed by a tab, which the lexer treats as prose.

The transformations are pure text functions in
[`GlyphEdits`](src/main/kotlin/com/glyphmark/intellij/GlyphEdits.kt), kept apart
from the actions and from
[`GlyphEnterHandler`](src/main/kotlin/com/glyphmark/intellij/GlyphEnterHandler.kt)
so they are unit tested without an IDE fixture.

Bold and Italic declare `control B` and `control I` against the `$default`
keymap only. The macOS keymap rewrites `$default`'s Ctrl bindings to ⌘, so they
arrive as <kbd>⌘B</kbd> and <kbd>⌘I</kbd> there without a second declaration.

Both keystrokes are already taken — <kbd>⌘B</kbd> by Go to Declaration,
<kbd>⌘I</kbd> by Implement Methods — and being enabled is *not* enough to win
one. When several actions match a keystroke the platform takes the first
candidate, so the binding alone leaves ⌘B jumping to a declaration. That is what
[`GlyphActionPromoter`](src/main/kotlin/com/glyphmark/intellij/GlyphActionPromoter.kt)
is for: an `actionPromoter` reorders the candidates so the markup actions are
tried first. The bundled Markdown plugin resolves the identical collision with
the identical mechanism.

Promoting is unconditional and still safe, because the actions disable
themselves outside `.glyph` files and the platform skips a disabled action — so
every other file type keeps the IDE's own binding.

## Install

The plugin is not on JetBrains Marketplace. It ships as a GitHub Release, which
doubles as a [custom plugin
repository](https://plugins.jetbrains.com/docs/intellij/custom-plugin-repository.html)
— so you still get install and update through the normal IDE flow.

**Recommended.** Add this URL under <kbd>Settings</kbd> → <kbd>Plugins</kbd> →
<kbd>⚙</kbd> → <kbd>Manage Plugin Repositories</kbd>:

```
https://github.com/DreadBoy/glyphmark/releases/latest/download/updatePlugins.xml
```

Then find **Glyphmark** on the Marketplace tab. New versions show up as ordinary
plugin updates, because that URL always resolves to the newest release.

**One-off.** Download the `.zip` from any release and use <kbd>Settings</kbd> →
<kbd>Plugins</kbd> → <kbd>⚙</kbd> → <kbd>Install Plugin from Disk…</kbd>. No
updates this way. The plugin is unsigned either way, so the IDE shows a warning
during installation.

Requires IntelliJ IDEA 2025.2 or newer (`since-build` 252, no upper bound).

## Releasing

Releases are cut by `.github/workflows/release.yml` from the same trigger as the
npm packages: bump `version` in the **root** `package.json` and merge to `main`.
The workflow sees no GitHub Release for that version, builds the plugin,
generates `updatePlugins.xml` from the built artifact, and publishes both as
release assets.

`scripts/set-version-from-root.mjs` stamps the root version into
`gradle.properties`, so the committed `version` there is a placeholder — the
same arrangement the publishable packages use for their `package.json` versions.

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
| `src/main/kotlin/`              | The plugin: file type, editor provider, JCEF preview editor, outline scanner, editing actions. |
| `preview/src/index.ts`          | The code that runs inside the preview browser.                     |
| `preview/esbuild.mjs`           | Bundles `@glyphmark/core` for the browser.                         |
| `src/main/resources/preview/`   | Generated bundle. Not checked in.                                  |

## Scope

`.glyph` files are still registered against plain text, so everything here works
off the document's characters rather than a syntax tree. That is enough for the
preview, the outline and the editing actions, but syntax highlighting,
completion and brace matching are not — those need a real `Language` with a
lexer and parser definition, which is the next structural step for the plugin.
