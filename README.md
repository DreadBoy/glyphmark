# Glyphmark

Convert Pathfinder 2e Glyph markup to styled, self-contained HTML or PDF.

This repository is an [Nx](https://nx.dev) monorepo containing the Glyphmark
parser/renderer, a CLI that wraps it, and a handful of internal tooling
libraries used while authoring fixtures from the source rulebooks.

## Projects

| Project          | Path             | Description                                                                  |
| ---------------- | ---------------- | ---------------------------------------------------------------------------- |
| `@glyphmark/cli` | `apps/cli`       | Command-line tool. Reads a `.glyph` file, writes `.html` or `.pdf`.          |
| `@glyphmark/core`| `libs/core`      | Parser and HTML/PDF renderer. The engine behind the CLI; also usable as a library. |
| `extract`        | `libs/extract`   | Node scripts for pulling single pages out of source PDFs and previewing their text-box layout. Author-time tooling. |
| `books`          | `libs/books`     | Source Pathfinder 2e PDFs and per-page extracts used as visual references for fixtures. Data only, no code. |

See each project's README for details:

- [`apps/cli/README.md`](apps/cli/README.md) — installing and using the CLI
- [`libs/core/README.md`](libs/core/README.md) — supported blocks and DSL notes
- [`libs/extract/README.md`](libs/extract/README.md) — page-extraction helpers

## Development

The workspace uses Nx with npm. Common tasks:

```bash
# install
npm install

# build everything
npx nx run-many -t build

# build a single project
npx nx build core
npx nx build cli

# run tests (core has the bulk of them, including visual goldens)
npx nx test core

# run the CLI from source
npx nx run cli:run -- input.glyph output.html
```

## License

Source-available under the [Elastic License 2.0](LICENSE). Personal and
internal use are free; you may not offer this software to third parties as a
hosted or managed service. See [`LICENSE`](LICENSE) for the full terms.
