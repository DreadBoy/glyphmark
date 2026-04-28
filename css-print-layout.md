# CSS Print Layout Notes

Reference for building paginated documents with newspaper-style columns,
sidebars, and dynamic page chrome. Covers what the browser does on its own,
what you can tell it explicitly, and where Paged.js is needed.

## 1. Two-column newspaper flow

Use CSS multi-column. It's the only built-in mechanism that auto-reflows
prose between columns while letting "atomic" blocks stay whole.

```css
.page {
  columns: 2;
  column-gap: 2rem;
  column-fill: auto;     /* fill col 1 first, don't balance */
  height: 100vh;         /* engine needs a bound to know "full" */
}

p { /* splits freely across columns by default */ }

figure, blockquote, .callout {
  break-inside: avoid;   /* push whole to next column if it doesn't fit */
}

.banner {
  column-span: all;      /* full-width interrupter; flow resumes in col 1 */
}
```

What the engine handles for free:

- Mid-paragraph column breaks (default behavior).
- Atomic blocks staying intact via `break-inside: avoid`. The engine pushes
  the whole block to the next column if it doesn't fit, leaving a short
  column above.
- Full-width spanners that interrupt the flow; content resumes in column 1
  below them.

Caveats:

- Default `column-fill: balance` evens column heights. For newspaper-style
  fill-then-overflow, set `column-fill: auto` AND give a height (or rely
  on paged media's page height — see §3).
- Atomic blocks taller than the column itself either overflow or split.
- Hint break locations with `break-before` / `break-after` / `break-inside`
  on individual elements; can't pin exact line positions.
- `widows` / `orphans` (default `2`) prevent dangling lines at column ends.
- `position: sticky` and `position: absolute` inside multi-column behave
  inconsistently across engines.

## 2. Sidebar via float

When some pages have a 30% sidebar + 70% main, and main should reclaim
the full width below the sidebar (the magazine pattern), use `float`.
This is the only built-in mechanism that gives "narrower beside the
sidebar, full width below."

```css
.sidebar {
  float: right;          /* or left */
  width: 30%;
  margin-left: 2rem;
  shape-outside: inset(0);   /* optional; non-rectangular wraps possible */
}

.main p {
  /* flows in remaining 70% beside sidebar, then 100% under it */
}
```

Caveats:

- The float must appear in source order *before* the text it should wrap
  past. You can nudge with negative margins, but exact vertical placement
  is awkward.
- Floats and margin collapse interact subtly. Use `clear: both` after the
  flow if you need to reset.
- A flex or grid parent disables float wrapping. Keep the float's parent
  as a normal block container.
- Floats are honored inside multi-column containers, but with edge cases
  around column breaks and `column-span: all`. Test in the engine you're
  rendering with.
- `shape-outside` accepts `circle()`, `polygon()`, alpha-channel images,
  etc. for non-rectangular wraps. Only one side at a time.

## 3. Pagination for print (CSS Paged Media)

When the document is printed (or rendered to PDF), the browser switches
to the CSS Paged Media model: it builds a sequence of "page boxes" and
runs your normal layout into them.

### Default behavior (no help from you)

Page boxes are sized by `@page` (or printer defaults). The engine
fragments content at page boundaries, preferring breaks between block
siblings over breaks inside them. `widows: 2` / `orphans: 2` apply.

Multi-column + paged media: the engine fills column 1 to the bottom of
the page, fills column 2 to the bottom of the page, then page-breaks and
starts column 1 of the next page. This is the newspaper-on-pages flow.
Set `column-fill: auto` so it doesn't balance.

### Explicit controls

```css
@page {
  size: A4;              /* or A4 landscape, or letter, or 210mm 297mm */
  margin: 20mm;
}

@page :first  { margin-top: 40mm; }
@page :left   { margin-left: 25mm; margin-right: 15mm; }   /* verso */
@page :right  { margin-left: 15mm; margin-right: 25mm; }   /* recto */
@page :blank  { /* intentionally blank pages, e.g., to start chapters on recto */ }

@page landscape   { size: A4 landscape; }
.appendix { page: landscape; }   /* assign element to a named @page */
```

Per-element fragmentation hints:

| Property                       | Effect                                              |
|--------------------------------|-----------------------------------------------------|
| `break-before: page`           | force a page break before this element              |
| `break-after: page`            | force a page break after                            |
| `break-inside: avoid`          | try not to split across pages or columns            |
| `break-inside: avoid-page`     | try not to split across pages (allow column break)  |
| `break-inside: avoid-column`   | try not to split across columns (allow page break)  |
| `break-before: recto` / `verso`| start on a right-hand / left-hand page              |
| `orphans: N` / `widows: N`     | min lines before / after a break inside a block     |

Legacy `page-break-*` names still work as aliases of `break-*`. Use
`break-*`.

### What you can't do via CSS alone

- Move content between pages based on measured fit — only hint with
  `break-*`.
- Repeat headers/footers from inside body content — `@page` margin boxes
  hold the chrome (see §4); browsers implement only a small subset.
- Reliably set running headers from chapter titles in vanilla browsers —
  `string-set` / `string()` work in Paged.js, Prince, and WeasyPrint, but
  not in browser print output.

### Previewing without entering print mode

| Approach                                   | Shows pagination? | Notes                                  |
|--------------------------------------------|-------------------|----------------------------------------|
| DevTools "Emulate print media"             | No                | Applies print styles only; no breaks   |
| Browser print preview / save PDF           | Yes               | Truest preview; the actual pipeline    |
| Paged.js                                   | Yes               | Renders paginated divs in normal page  |
| Vivliostyle                                | Yes               | Web-based paged renderer w/ viewer     |
| Manual `width: 210mm; height: 297mm` divs  | No                | Cheap; only works for static layouts   |
| Headless `chromium --print-to-pdf` watcher | Yes               | Same as print preview, scriptable      |

DevTools emulation is good for tweaking print typography/colors. Paged.js
is the standard tool for an interactive in-browser paged view. Drop to
print preview / headless PDF for final fidelity checks.

## 4. Page chrome with `@page` margin boxes

`@page` provides 16 named slots around the page area:

```
┌──────────────────────────────────────────────────────┐
│ TLC   top-left    top-center    top-right        TRC │
├──────────────────────────────────────────────────────┤
│ LT  ┌──────────────────────────────────────────┐  RT │
│     │                                          │     │
│ LM  │             page content area            │  RM │
│     │                                          │     │
│ LB  └──────────────────────────────────────────┘  RB │
├──────────────────────────────────────────────────────┤
│ BLC  bottom-left  bottom-center  bottom-right    BRC │
└──────────────────────────────────────────────────────┘

TLC = @top-left-corner       LT = @left-top      RT = @right-top
TRC = @top-right-corner      LM = @left-middle   RM = @right-middle
BLC = @bottom-left-corner    LB = @left-bottom   RB = @right-bottom
BRC = @bottom-right-corner
```

Each is filled via `content`:

```css
@page {
  size: A4;
  margin: 25mm;
  @top-right     { content: counter(page); }
  @bottom-center { content: counter(page) " / " counter(pages); }
}
```

`counter(page)` / `counter(pages)` are built-in for current/total page
numbers.

### Running headers — capture body content into chrome

`string-set` captures content from a body element; `string()` retrieves
it in a margin box. The captured value persists until the next element
overwrites it, so the value at page-render time is "whichever heading
was most recently passed":

```css
h1 { string-set: chapter content(); }
h2 { string-set: section content(); }

@page {
  @top-left  { content: string(chapter); }
  @top-right { content: string(section); }
}
```

`string-set` modifiers control which heading wins on a page that contains
several:

- `string-set: name first` — the first occurrence on the page
- `string-set: name start` — the value at page start
- `string-set: name last` — the last occurrence on the page

### Rich content in chrome — `position: running()`

Margin boxes can hold structured HTML, not just generated strings, via
running elements:

```css
.running-header { position: running(header); }
@page { @top-center { content: element(header); } }
```

The element is taken out of normal flow into a named slot, then
re-injected into the margin box.

### ToC entries with page numbers — `target-counter()`

For book-style ToC entries that say "Chapter 3 ........ 47":

```css
.toc a::after {
  content: leader(".") " " target-counter(attr(href), page);
}
```

Resolves at print time. Requires Paged.js / Prince / WeasyPrint — vanilla
browsers don't implement `target-counter`.

### Verso vs recto chrome

Pseudo-classes on `@page`:

- `@page :left` — verso (left-hand) page
- `@page :right` — recto (right-hand) page
- `@page :first` — first page of the document
- `@page :blank` — intentionally blank pages
- `@page :nth(n)` — every nth page

Cascade onto the base `@page`:

```css
@page :left {
  margin-left: 30mm; margin-right: 20mm;
  @top-left  { content: counter(page); }       /* page no. on outside  */
  @top-right { content: string(chapter); }     /* chapter on inside    */
}
@page :right {
  margin-left: 20mm; margin-right: 30mm;
  @top-left  { content: string(section); }
  @top-right { content: counter(page); }
}
```

## 5. Dynamic outline-ToC in chrome (build-time generation)

The pattern: each page shows a ToC where the path from h1 → h2 → h3 → h4
to the current location is expanded; everything else is collapsed.

`string-set` alone gives you the *breadcrumb* (the path itself). It
can't give you the surrounding ToC, because CSS strings hold one value
at a time and can't enumerate the document.

When the document is generated from JSON at build time, the named-page
approach becomes practical: emit one ToC variant per outline state, one
named `@page` per variant, and let the cascade pick the right one. No
JavaScript at any stage; PDF is fully static.

### Generation pattern

For each unique (h1, h2, h3, h4) prefix that appears in the document:

1. Generate one running ToC element with the outline collapsed everywhere
   except the path to that h4.
2. Generate one named `@page` rule that pulls that element into the
   margin box.
3. Stamp `page: <name>` on the corresponding section in the body.

```html
<aside class="toc" style="position: running(toc-h4-17)">
  <ul>
    <li>1. Section A
      <ul>
        <li>1.1 Subsection
          <ul>
            <li>1.1.2 Sub-sub
              <ul>
                <li class="current">1.1.2.3 Current h4</li>
                <li>1.1.2.4 Next h4</li>
              </ul>
            </li>
            <!-- other 1.1.x as names only -->
          </ul>
        </li>
        <!-- other 1.x as names only -->
      </ul>
    </li>
    <!-- other h1s as names only -->
  </ul>
</aside>

<section class="h4-section" data-page="h4-17">…body…</section>
```

```css
@page h4-17 { @left-middle { content: element(toc-h4-17); } }
.h4-section[data-page="h4-17"] { page: h4-17; }
```

If the JSON has 400 h4s, emit 400 running elements + 400 named pages.
The CSS file is large but trivially generated; engines handle it fine.

### Breadcrumb path (free, no generation needed)

For "current section number/title" in chrome, capture each level via
`string-set` and glue them in a margin box:

```css
h1 { string-set: ch1 content(); counter-increment: ch1; counter-reset: ch2; }
h2 { string-set: ch2 content(); counter-increment: ch2; counter-reset: ch3; }
h3 { string-set: ch3 content(); counter-increment: ch3; counter-reset: ch4; }
h4 { string-set: ch4 content(); counter-increment: ch4; }

@page {
  @top-left {
    content: string(ch1) " › " string(ch2) " › " string(ch3) " › " string(ch4);
  }
}
```

Updates per page automatically. Combine with the outline-ToC above.

### Caveat: which named page wins on transition pages

Named pages select chrome based on which element is on the page. When a
page contains the end of `h4-N` and the start of `h4-(N+1)`, engines
typically pick the named page of the *first* element on the page —
`h4-N` "wins" on its trailing scrap. Whether that matches intent is a
design call:

- "The section that started this page" → free, declarative; usually fine.
- "The section most prominent on this page" → not expressible
  declaratively; needs a post-layout pass to reassign.

Most readers expect chrome to match the visible flow as the page begins,
so the default is usually acceptable.

### Granularity

Generate one variant per *distinct outline state*, not per heading. If a
page falls under an h3 that has no h4 children yet reached, emit a
variant keyed at h3 with no h4 expansion. Enumerate every distinct
(h1, h2?, h3?, h4?) prefix that appears in the document.

## 6. Engine support matrix

| Feature                                | Browsers (print) | Paged.js | Prince / WeasyPrint |
|----------------------------------------|------------------|----------|---------------------|
| `counter(page)` / `counter(pages)`     | partial          | yes      | yes                 |
| `@top-*` / `@bottom-*` margin boxes    | mostly no        | yes      | yes                 |
| `@left-*` / `@right-*` margin boxes    | no               | yes      | yes                 |
| `string-set` / `string()`              | no               | yes      | yes                 |
| `position: running()` / `element()`    | no               | yes      | yes                 |
| `target-counter()`                     | no               | yes      | yes                 |
| `@page :left` / `:right` / `:first`    | partial          | yes      | yes                 |
| Named pages (`page: name`)             | no               | yes      | yes                 |
| `break-*` (page/column fragmentation)  | partial          | yes      | yes                 |
| `widows` / `orphans`                   | yes              | yes      | yes                 |

The chrome features in §4–§5 require a real paged-media engine. The
browser print pipeline alone is not enough.

## 7. Paged.js

Open-source JS polyfill for CSS Paged Media. Re-renders the document as
a stack of paginated `<div>`s in the normal browser viewport. Honors
`@page`, `break-*`, margin boxes, named pages, running elements,
`target-counter()`, etc. — usually more of the spec than browsers
themselves implement.

What it gives you:

- Live in-page preview of pagination (no print preview dialog).
- Inspect with DevTools; scroll between pages; see the whole document at
  once.
- Print to PDF from the rendered view = same output you'd get from
  browser print.
- Hooks (`afterPageLayout`, `afterRendered`) for post-layout scripts if
  needed (the §5 approach doesn't need them).

Quick start:

```html
<script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
```

Including the polyfill is enough — Paged.js takes over and re-renders.
Configure via `<style>@page { ... }</style>` exactly as you would for
native print.

For PDF output in CI, run headless Chromium against a Paged.js page and
save the print output. The pagination matches the in-browser view.

Alternatives in the same niche:

- **Vivliostyle** — similar, with a packaged viewer app.
- **Prince** — commercial, server-side, highest fidelity, fastest. Worth
  it for production book pipelines.
- **WeasyPrint** — Python, open source. Solid spec coverage, smaller
  footprint than Prince.