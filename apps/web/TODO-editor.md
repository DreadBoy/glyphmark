# WYSIWYG Editor - TODO

## Architecture Decision
- Static site hosted on GitHub Pages (free, zero friction)
- TipTap editor (built on ProseMirror) for WYSIWYG editing
- IndexedDB for default storage (no server, no sign-up)
- No database, no auth, no Docker

## Storage Strategy
- [x] IndexedDB as default (zero friction, works immediately)
- [ ] Export/import JSON files (manual portability)
- [ ] File System Access API (optional, Chrome/Edge only — read/write local folder)
- [ ] Shareable links via URL fragments (small documents encoded in URL)

## Editor Setup
- [x] Scaffold static site (Vite or plain, deployable to GitHub Pages)
- [x] Integrate TipTap editor
- [x] Apply existing PF2e scribe CSS so editor is true WYSIWYG
- [x] Define custom node types: columns, headings, item blocks, stat blocks
- [x] Slash commands or toolbar for inserting block types
- [x] Keyboard shortcuts for common formatting

## Export
- [ ] PDF via jsPDF — consistent cross-browser output, custom fonts, no user config needed
  - Browser print CSS is unreliable (backgrounds stripped, page breaks inconsistent, browser-added headers)
  - jsPDF positioning logic can be AI-generated and verified with golden snapshot tests
  - Reuse existing visual test infra (pixelmatch/pngjs) — render PDF pages to PNG via pdf.js, compare
- [ ] Export to HTML
- [ ] Export to image (for Discord/Reddit sharing)
- [ ] Export to JSON (document model)

## Archives of Nethys Integration
AoN has a public API serving game data as JSON — all client-side, no server needed.
- [ ] Cmd+K search & link — autocomplete from AoN API, insert formatted reference/link
- [ ] Embed full block — fetch item/monster/spell data, render as styled editor node
- [ ] Investigate AoN API availability and CORS support

## Adoption Drivers
- [ ] Pre-built templates (stat blocks, item cards, spell entries)
- [ ] Good defaults — looks good out of the box
- [ ] Shareable output for Reddit/Discord

## Not Doing
- User accounts / database / server
- Self-hosted Docker
- Desktop app (Electron/Tauri)
- .scribe as primary format (use ProseMirror doc model; export to other formats)