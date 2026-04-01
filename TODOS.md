## Future Work

### PDF Export
- **What:** Add `glyphmark pdf` command that renders HTML and exports to PDF
- **Why:** PF2e users ultimately want printable content that looks like official rulebooks
- **Depends on:** Playwright already being a dev dependency (added for visual tests)
- **Effort:** Small, ~5 lines: load HTML with Playwright, call page.pdf() with correct margins/size

### External Embeds
- **What:** Support monster.pf2.tools, template.pf2.tools, scribe.pf2.tools URLs rendered inline
- **Why:** Makes glyphmark handle 100% of scribe documents, not just ones without external references
- **Depends on:** Network access at build time, parsing remote response format
- **Effort:** Medium, need to fetch URL, parse scribe/JSON response, render as item block
