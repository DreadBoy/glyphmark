# extract

Two small CLI helpers for pulling pages out of the source books in
`libs/books/`. Each lives as a standalone `.js` (no compile step), runnable
directly with `node`.

## `extract.js` — single-page PDF extract

Copies one page of a source PDF into a smaller standalone PDF. Used to
create the per-page reference PDFs in `libs/books/extracts/`.

```bash
node libs/extract/src/extract.js \
  --source "libs/books/Pathfinder 2e - Player Core (Remaster).pdf" \
  --page 16 \
  --out "libs/books/extracts/Pathfinder 2e - Player Core (Remaster)-p16.pdf"
```

Flags:

- `--source` / `-s` — path to the multi-page PDF (required).
- `--page` / `-p` — 1-based page number to extract (required). Note this
  is the **PDF page number**, not the printed page number in the book —
  they typically differ by the front matter offset (e.g. printed page 15
  is usually PDF page 16).
- `--out` / `-o` — output path. Defaults to `<source>-p<page>.pdf` next to
  the source file.

## `highlight-text.js` — highlighted-textboxes preview HTML

Renders one page of a PDF to PNG, extracts the per-character text-run
bounding boxes via pdf.js, and writes a single self-contained HTML file
that overlays the boxes on top of the rendered page. Hovering a box shows
its source text — useful for understanding the source book's layout when
recreating it as a glyphmark fixture.

```bash
node libs/extract/src/highlight-text.js \
  --source "libs/books/Pathfinder 2e - Player Core (Remaster).pdf" \
  --page 16 \
  --out "libs/books/extracts/Pathfinder 2e - Player Core (Remaster)-p16.html"
```

Flags:

- `--source` / `-s` — path to the PDF (required).
- `--page` / `-p` — 1-based page number (required).
- `--out` / `-o` — output HTML path. Defaults to
  `<source>-p<page>-textboxes.html`.
- `--scale` — pixel scale for the rendered PNG. Default `2`. Higher gives
  sharper text at the cost of file size.

## When to use which

- Need to **read** what's on a book page (text content, structure): pull
  it with `extract.js` to PDF, then use Claude's `Read` tool which can
  inspect PDFs page-by-page.
- Need to **measure** something visual (column widths, text positions,
  exact heading sizes): use `highlight-text.js` and open the resulting
  HTML in a browser. The overlays carry pixel coordinates.

Both commands write into `libs/books/extracts/` by default when
re-extracting an existing page.
