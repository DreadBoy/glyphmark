# Glyphmark

Convert Pathfinder 2e Scribe markup to styled, self-contained HTML. Zero runtime dependencies.

## Install

```bash
npm install -g glyphmark
```

Or use directly with npx:

```bash
npx glyphmark input.scribe output.html
```

## Usage

```bash
glyphmark <input.scribe> <output.html>
```

Reads a `.scribe` file and writes a single self-contained HTML file with all styles embedded.

## Recipes

### Batch processing

```bash
for f in *.scribe; do glyphmark "$f" "${f%.scribe}.html"; done
```

### Watch mode

Use any file watcher. With [watchexec](https://github.com/watchexec/watchexec):

```bash
watchexec -w myfile.scribe -- glyphmark myfile.scribe output.html
```

With [entr](https://eradman.com/entrproject/):

```bash
echo myfile.scribe | entr glyphmark myfile.scribe output.html
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

const html = convert(scribeSource);
```

## Scribe DSL Reference

### Metadata Blocks

```
watermark (DRAFT)
```
Adds text overlay at the top of every page.

```
title (My Document Title)
```
Adds a document title to every page header.

```
css (.custom { color: red; })
```
Injects custom CSS. Multiple `css()` blocks are concatenated.

```
fonts (Roboto:ital,wght@0,400;0,700;1,400;1,700)
```
Imports Google Fonts. One font spec per line.

```
pagenumbers
```
Enables page numbering (bottom-right of each page).

### Content Blocks

```
head (
# Document Heading
A description of the section.
-
)
```
Header block with title, description, and `-` separator.

```
info (
## Important
White text on colored background.
)
```

```
rules (
# Rules Reminder
Follow these rules.
)
```

```
note (
# Sidebar Note
Supplementary information.
)
```

```
math (
Total = base + modifier + bonuses - penalties
)
```

### Sidebars

```
left (
# Left Sidebar
Content here.
)
```
Left sidebar (~1/3 page width).

```
right (
# Right Sidebar
Content here.
)
```
Right sidebar (~1/3 page width).

### Item Block

Full stat block for feats, items, creatures:

```
item(
# Power Strike :a: ((+Feats))
## Feat 4
-
; uncommon,class,feat
**Requirements** You must be wielding a melee weapon.
-
Make a melee Strike with a +2 circumstance bonus to damage.
)
```

Structure:
- `# Name :action: ((+TOC Label))` — name with optional action symbol and TOC entry
- `## Subtitle` — optional subtitle
- `-` — first separator (required)
- `; trait1,trait2` — optional traits (comma-separated)
- Top section content (requirements, usage, etc.)
- `-` — second separator (optional; splits top section from body)
- Body content

### Layout Controls

| Syntax | Effect |
|--------|--------|
| `=` | Page break |
| `/` | Toggle columns on/off |
| `\|` | Break to next column |
| `-` | Horizontal rule |

### Inline Formatting

| Syntax | Result |
|--------|--------|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `[text](url)` | Link |
| `[text](#label)` | Label link (anchor) |
| `![alt](src)` | Image |

### Action Symbols

| Syntax | Symbol |
|--------|--------|
| `:a:` | Single action |
| `:aa:` | Two actions |
| `:aaa:` | Three actions |
| `:r:` | Reaction |
| `:f:` | Free action |

### Headings & Table of Contents

```
# Main Section ((Title))
## Sub-section ((+Sub))
### Deeper ((++Deep))
```

- `((label))` — TOC entry at indent 0
- `((+label))` — TOC entry at indent 1
- `((++label))` — TOC entry at indent 2

### Tables

```
##### Table Caption ((+Tables))
Name | Value | Notes
--- | :---: | ---:
Alpha | 10 | First
Beta | 20 | Second
. * Values are approximate.
```

- Pipe-delimited columns
- Alignment: `:---` left, `:---:` center, `---:` right
- H4/H5/H6 heading before table becomes caption
- `.*` lines after table become footnotes

### Content References

Define reusable content blocks:

```
greeting {
Hello from a content reference!
}
```

Expand with `{{greeting}}`. References can contain block DSL and are fully parsed when expanded. Nested expansion supported (up to 10 levels deep).

### Hidden Content

```
Visible content here.

%

hiddenref {
note(# Hidden Note)
}
```

Everything after `%` is hidden from output but content refs defined there can still be expanded with `{{key}}`.

### Trait System (Item Blocks)

Traits are semicolon-prefixed, comma-separated:

```
; uncommon,large,chaotic evil,beast,dragon
```

Special styling:
- **Rarity**: `uncommon`, `rare`, `unique`
- **Size**: `tiny`, `small`, `medium`, `large`, `huge`, `gargantuan`
- **Alignment**: `lg`, `ln`, `le`, `ng`, `n`, `ne`, `cg`, `cn`, `ce` (or full names)
- All other values render as generic traits

### Hanging Indents

Paragraphs starting with `**bold text**` get a hanging indent style.

## License

MIT
