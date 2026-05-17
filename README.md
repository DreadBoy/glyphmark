# Glyphmark

Convert Pathfinder 2e Glyph markup to styled, self-contained HTML. Zero runtime dependencies.

## Install

```bash
npm install -g @glyphmark/cli
```

Or use directly with npx:

```bash
npx @glyphmark/cli input.glyph output.html
```

## Usage

```bash
@glyphmark/cli <input.glyph> <output.html>
```

Reads a `.glyph` file and writes a single self-contained HTML file with all styles embedded.

## Recipes

### Batch processing

```bash
for f in *.glyph; do glyphmark "$f" "${f%.glyph}.html"; done
```

### Watch mode

Use any file watcher. With [watchexec](https://github.com/watchexec/watchexec):

```bash
watchexec -w myfile.glyph -- glyphmark myfile.glyph output.html
```

With [entr](https://eradman.com/entrproject/):

```bash
echo myfile.glyph | entr glyphmark myfile.glyph output.html
```

### Live reload

Pair with any static file server that supports live reload. With [browser-sync](https://browsersync.io/):

```bash
browser-sync start --server --files output.html
```

Or use the VS Code [Live Preview](https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server) extension to open the output HTML.

## Programmatic API

```js
import { convert } from "glyphmark";

const html = convert(glyphSource);
```

## Glyph DSL Reference

TODO

## License

MIT
