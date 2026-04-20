<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Visual Tests (libs/core/test/visual/)

Each fixture directory contains `input.scribe` and `golden.png`. The test
renders our pipeline's output and compares it pixel-for-pixel against the
golden at `DIFF_THRESHOLD = 0`.

## Import vs regenerate — they are NOT the same

- **Import** — run the legacy reference system (scribe.pf2.tools) against
  `input.scribe` and save its screenshot as the new `golden.png`. The
  golden then represents the authoritative target that our renderer must
  match. Triggered by `IMPORT_GOLDENS=1`.
- **Regenerate** — copy our own `output.png` to `golden.png`. This makes
  the test trivially pass and erases any real regression signal.
  Triggered by `UPDATE_SNAPSHOTS=1`.

**Only import. Never regenerate.** Regenerating destroys the signal we
use to verify our renderer matches the legacy one. Import is only valid
when you've intentionally changed `input.scribe` and need a fresh golden
from the legacy system.

## When importing a golden, run only that one test

`IMPORT_GOLDENS=1` overwrites the `golden.png` of every test it touches.
Filter to the specific fixture with `-t`:

```
IMPORT_GOLDENS=1 npx vitest run --config libs/core/vitest.config.ts -t "25-sidebar-stacked-sections"
```

Without `-t`, every fixture's golden gets overwritten by whatever
scribe.pf2.tools happens to render at that moment — silently clobbering
known-good goldens.
