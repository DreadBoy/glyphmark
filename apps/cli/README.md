# @glyphmark/cli

Command-line tool that converts a `.glyph` source file into a self-contained
HTML file (all styles inlined, zero runtime dependencies) or a PDF, styled to
look like a page from the Pathfinder 2e rulebooks.

Powered by [`@glyphmark/core`](../../libs/core).

## Install

```bash
npm install -g @glyphmark/cli
```

Or run directly with `npx`, no install required:

```bash
npx @glyphmark/cli input.glyph output.html
```

## Usage

```bash
glyphmark <input.glyph> <output.(html|pdf)>
```

The output format is chosen from the output file's extension:

- `.html` — single self-contained HTML file, all styles inlined.
- `.pdf`  — paginated PDF rendered through the same layout engine.

Any other extension is an error.

```bash
glyphmark spells.glyph spells.html
glyphmark spells.glyph spells.pdf
```

## The `.glyph` syntax

Glyph is a small Markdown-flavoured DSL. The file is read line-by-line — most
markers must occupy a line on their own.

### Inline

| Syntax                              | Renders as          |
| ----------------------------------- | ------------------- |
| `**bold**` or `__bold__`            | **bold**            |
| `*italic*` or `_italic_`            | *italic*            |
| `***bold italic***` or `___…___`    | ***bold italic***   |
| `^superscript^`                     | E=mc<sup>2</sup>    |
| `~subscript~`                       | H<sub>2</sub>O      |

No arbitrary nesting and no escaping. Bold and italic together are only
expressed with the triple form applied to the whole span — `**bold *italic*
bold**` keeps the inner `*`s literal. To bold a run and italicise only part of
it, close and reopen: `**bold *****and italic***** and bold**`. Unbalanced or
empty delimiters render literally.

Superscript and subscript are Pandoc-style single-delimiter pairs — `Herexen^U^`
→ Herexen<sup>U</sup>, `H~2~O` → H<sub>2</sub>O — handy for rulebook rarity
markers and formulae. The inline `^…^` is distinct from the line-level `^ `
(caret **followed by a space** at the start of a line) centered-formula marker
used inside `sample()`; only the latter centers a whole line. Note this is a
behavior change: a `.glyph` written before this feature that contained a literal
`^x^` or `~x~` pair now renders as super/subscript.

### Headings

```glyph
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
```

`h5`/`h6` are accepted by the lexer but warn-and-dropped — only `h1`–`h4` are
styled.

### Paragraphs and lists

Paragraphs are runs of plain text separated by a blank line. Indentation is
applied automatically based on context (first-paragraph-in-section sits flush,
later ones get a first-line indent; bold-leading paragraphs in `item()` get a
hanging indent — matching how the rulebooks set their text).

Lists use `*` or `-` followed by a space. A lone `-` on its own line is a
horizontal rule, not a list item.

```glyph
* First item
* Second item
- Also a list item
```

### Line markers

Each of these stands alone on its own line:

| Marker | Meaning                                                                 |
| ------ | ----------------------------------------------------------------------- |
| `=`    | Page break.                                                             |
| `\|`   | Column break. A trailing `\|` at end of file forces single-column flow. |
| `/`    | Toggle full-width band (escapes the 2-column grid). Each `/` flips it.  |
| `-`    | Horizontal rule. Only valid as a separator inside `item()` blocks.      |
| `%`    | Hidden delimiter. Everything below `%` is parsed but not rendered — useful for stashing content-reference definitions out of the way. |

### Container blocks

Block-level constructs use a `keyword(...)` form. The opening keyword and `(`
sit on one line; the closing `)` sits on its own line. They cannot be nested.

| Block        | Purpose                                                  |
| ------------ | -------------------------------------------------------- |
| `item(...)`  | Feat / spell / monster / background card.                |
| `sample(...)`| Tinted "example" box. Supports centered formula lines.   |
| `rule(...)`  | GM advice / rule explanation box.                        |
| `info(...)`  | Small tinted callout (key attribute, hit points, etc.).  |
| `head(...)`  | Page-spanning header band (e.g. ancestry/class title).   |
| `sidebar(...)`| Maroon margin/aside lore note, not boxed (e.g. Monster Core). |

#### `item()`

The most structured block. The body follows a fixed prologue:

```glyph
item(
# Combat Reading :a:
## Feat 4
-
;Bard, Secret

You use a performer's cold reading techniques... The GM rolls a secret
Occultism check for you against the Deception or Stealth DC...

**Critical Success** The GM chooses and tells you two of the following
pieces of information about the enemy...

**Success** The GM chooses one piece of information from the above list...
)
```

- `# name` — required. A trailing **action icon** (`:a:`, `:aa:`, `:aaa:`,
  `:r:`, `:f:`) is lifted out of the name and rendered next to it.
- `## subtitle` — optional.
- `-` — required separator between heading and body.
- `;trait1, trait2` — optional trait line(s).
- Body — paragraphs, lists, and further `-` separators between sections.

#### `sample()`

Supports paragraphs, headings (`#`–`##`), and centered formula lines using
`^ ` at the start of the line:

```glyph
sample(
# Damage Dice

Each weapon lists the damage die used for its damage roll...

^ **1d4 » 1d6 » 1d8 » 1d10 » 1d12**
)
```

#### `rule()`, `info()`, `head()`

```glyph
rule(
# Extra Preparation

When Earning Income, you might be able to spend days of downtime...

## Ending or Interrupting Tasks

When a task you're doing is complete...
)
```

`info()` caps headings at `h2`. `head()` also caps at `h2`, but there the `##`
is special: it renders as a small chapter **eyebrow** sitting above the `#`
display title — handy for a "CHAPTER 1:" label over a page's title.

```glyph
head(
## CHAPTER 1:
# INTRODUCTION

Pathfinder is a fantasy tabletop roleplaying game where you and a group of
friends gather to tell a tale of brave heroes and cunning villains...
)
```

#### `sidebar()`

A margin/aside lore note (e.g. Monster Core's "SHUYOOKHS" or "BASILISK LAIRS").
Not boxed like `info()`/`rule()` — a `#`/`##` title (capped at `h2`) over short
maroon prose, plus lists and tables (same content as `rule()`, minus column
breaks). Rendered as a full-height rail against the page edge, separated from the
main text by a keyline.

```glyph
sidebar(
# Jann Shuyookhs

Jann shuyookhs add the following innate spells: **4th** *invisibility* (×2).
)
```

Each block warns and drops anything outside its allowed segment set (e.g.
tables inside `info()`).

### Tables

GitHub-style pipe tables. The separator row sets per-column alignment
(`:--`, `:-:`, `--:`). Footnotes are defined on lines starting with `. [n]`
and referenced in cells with `[n]` (numbered) or `[*]` (unnumbered):

```glyph
#### Differently Sized Items

| Creature Size | Price    | Bulk   |
|:-------------:|:--------:|:------:|
| Tiny          | Standard | Half[*]|
| Small or Med. | Standard | Standard|
| Large         | x2       | x2     |

. [*] An item that would have its Bulk reduced below 1 has light Bulk.
```

A heading-4-or-deeper immediately preceding the table is lifted to be the
table's caption.

**Headerless tables.** Start a table with the **separator row** directly — no
header line above it — and the table renders with no header band at all. The
separator still sets per-column alignment and fixes the column count, which
makes this the natural fit for key/value "stat block" layouts:

```glyph
#### At a Glance

|:-------------|----------------:|
| **Cost**     | 3 gp            |
| **Bulk**     | 1               |
| **Hands**    | 2               |
| **Damage**   | 1d8 slashing[*] |

. [*] Add your Strength modifier to the listed damage.
```

The opening separator must contain a `|` — that is what marks it as a table
rather than a horizontal rule (a bare `---` on its own line is still an HR).
Every data row should have the same number of columns as the separator; a
mismatched row is warned about (it's almost always a missing or stray `|`).

### Content references

Define a reusable block once and expand it elsewhere. Definitions look like
`key { ... }`, references look like `{{key}}` on a line by itself:

```glyph
artisan {
item(
# ARTISAN
## BACKGROUND
-
As an apprentice, you practiced a particular form of building or crafting...
)
}

{{artisan}}
{{artist}}

%

artist {
item(
# ARTIST
## BACKGROUND
-
Your art is your greatest passion, whatever form it takes...
)
}
```

A common pattern (above): stash all the definitions below `%` so they don't
clutter the visible flow, and only use them via `{{key}}` above.

References are block-level only: `{{key}}` inside a paragraph renders
literally, and definitions cannot be nested inside a container block.

### Preamble

Optional, at the top of the file:

- `css( ... )` — extra CSS appended to the document's inlined stylesheet.
- `fonts( ... )` — one font specification per line, to be embedded.

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

Pair with any static file server that supports live reload. With
[browser-sync](https://browsersync.io/):

```bash
browser-sync start --server --files output.html
```

Or use the VS Code
[Live Preview](https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server)
extension to open the output HTML.

## Programmatic API

To embed Glyphmark inside another tool, use `@glyphmark/core` directly:

```js
import { parseGlyph, renderToHtml, renderToPdf } from '@glyphmark/core';

const doc = parseGlyph(glyphSource);

const html = renderToHtml(doc);        // string
const pdf  = await renderToPdf(doc);   // Uint8Array
```

## License

[Elastic License 2.0](./LICENSE). Free for personal and internal use; you may
not offer this package to third parties as a hosted or managed service.
