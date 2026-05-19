# @glyphmark/core

Parser and renderer for the `.glyph` markup language — produces self-contained
HTML and PDF documents styled to match the Pathfinder 2e rulebook layout.

This is the engine behind the [`@glyphmark/cli`](https://www.npmjs.com/package/@glyphmark/cli)
tool. Use this package directly if you want to embed the renderer in a web
playground, editor plugin, docs site, or anything else that already runs JS.

## Install

```bash
npm install @glyphmark/core
```

`renderToPdf` additionally needs [Playwright](https://playwright.dev) at
runtime (it's declared as an optional peer):

```bash
npm install playwright
npx playwright install chromium
```

If you only need `renderToHtml`, skip the Playwright install.

## Quick start

```ts
import { parseGlyph, renderToHtml, renderToPdf } from '@glyphmark/core';
import fs from 'node:fs';

const source = fs.readFileSync('example.glyph', 'utf-8');
const doc = parseGlyph(source);

// HTML — synchronous, returns a self-contained string with inlined styles
fs.writeFileSync('example.html', renderToHtml(doc));

// PDF — async, returns a Buffer (requires Playwright)
fs.writeFileSync('example.pdf', await renderToPdf(doc));
```

## API

### `parseGlyph(input: string): GlyphDocument`

Parses a `.glyph` source string into an intermediate document tree. Throws on
syntax errors with line/column information.

### `renderToHtml(doc: GlyphDocument): string`

Renders a parsed document to a complete HTML string. Output is self-contained
— fonts, styles, and ornaments are all inlined, so the result can be served
or saved as a single file.

### `renderToPdf(doc: GlyphDocument): Promise<Buffer>`

Renders to PDF by spinning up a headless Chromium via Playwright and printing
the HTML. Returns a `Buffer` containing the PDF bytes. Playwright is a peer
dependency — install it separately if you need this function.

### Types

`GlyphDocument` and `BodyNode` are exported for callers that want to inspect
or transform the IR between parsing and rendering.

## License

[Elastic License 2.0](./LICENSE). Free for personal and internal use; you may
not offer this package to third parties as a hosted or managed service.
