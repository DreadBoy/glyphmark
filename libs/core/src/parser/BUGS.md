# Known lexer and parser defects

A working record of defects found while reviewing `lexer.ts` and `parser.ts` ahead
of the lexer refactor. **Documentation only — nothing here has a test yet.**

Every entry was verified by running the lexer or parser directly; the "Observed"
lines are captured output, not readings of the source. Line references are
against the state of the tree when this file was written.

None of these are reachable from the 28 golden fixtures, which are all
well-formed documents. That is deliberate context for the refactor: a green
golden run proves *no regression on well-formed input*, not bug-for-bug parity on
malformed input.

## How this file is meant to be used

The lexer refactor (flatten the token tree to a stream; move whitespace
normalization out) comes first, guided by the IR goldens. Several defects below
are artifacts of `captureBalanced` scanning characters mid-line and will simply
cease to exist in a line-oriented lexer — they are marked **dissolves on
flatten**. Those need no separate fix.

The rest are revisited *after* the refactor, one at a time, each with its own
test. Expect this list to gain and lose entries as the refactor teaches us more.

---

## A. Delimiter scanning (`captureBalanced`, lexer.ts:401-465)

### A1. A `)` anywhere in prose truncates the block and deletes text

The balancer scans character by character, so a closing paren in ordinary prose
ends the block.

```
rule(
smiley :) here
more
)
```

**Observed:** one `block-open` with `raw: "smiley :"`. The text `" here"` appears
in **no token at all**. The block's span runs to offset 20 while its children
stop at 14 — the span claims coverage the tokens do not provide. `more` and `)`
become top-level `text`.

**Why it matters beyond the lost text:** a span that overstates its content
breaks any consumer that trusts spans to tile the source, which an IDE lexer must.

*Dissolves on flatten* — a line-oriented lexer never looks for `)` mid-line.

### A2. The matched close index is computed and then discarded

The balance loop correctly finds the matching close delimiter at index `i`, then
calls `locate(block, block.lastIndexOf(close), li)` (lexer.ts:448) — using the
*last* occurrence rather than the matched one.

**Observed:** `rule(a) and (b)` yields `raw: "a) and (b"` instead of `"a"`.

The correct index is already in hand at the call site.

*Dissolves on flatten.*

### A3. A stray `(` in prose eats the rest of the document

```
rule(
see (page 295
)
after
```

**Observed:** `raw: "see (page 295\n)\nafter"` — a single `block-open` consuming
to EOF. The unmatched `(` raised the depth, so the real `)` only brought it back
to 1.

Parenthesis parity in prose is load-bearing, with no feedback of any kind.

*Dissolves on flatten.*

### A4. Text after the closing delimiter on the same line is dropped

**Observed:** `rule(text) trailing` produces one `block-open` whose span is
`{startOffset: 0, endOffset: 19}` — covering `" trailing"` — with no token for
that text. `i = captured.endLine + 1` (lexer.ts:204) skips the remainder of the
closing line.

Either forbid trailing content with a diagnostic, or emit it. Silently spanning
it is the one option that helps nobody.

### A5. An unterminated block is indistinguishable from a terminated one

```
item(          item(
# Foo    vs    # Foo
body           body
               )
```

**Observed:** identical token shapes. `captureBalanced` falls through to "take
everything after the open delimiter" (lexer.ts:453) and records nothing about
having never found the close.

This is the single most important entry for the IntelliJ port: an editor sees
this state on almost every keystroke while the user types `item(`, and brace
matching, folding, and error highlighting all need to know. Needs a `closed:
boolean` (or an explicit `block-close` token) at minimum.

### A6. Unreachable branch

`captureBalanced` is only called after a match that guarantees the open delimiter
is present, so the `openIdx < 0` guard (lexer.ts:456-463) cannot be taken. Delete.

---

## B. Line-ending and whitespace handling

### B1. CRLF silently disables every lone marker

`input.split('\n')` (lexer.ts:98) leaves a trailing `\r` on every line, and the
lone-marker checks are exact string comparisons against `line` (lexer.ts:142-166).
`'=\r' === '='` is false.

**Observed:** `a␍␊=␍␊-␍␊b` lexes as `text, text, text, text`. The same input with
LF gives `text, page-break, hr, text`.

So on a CRLF document **every page break, column break, full-width toggle,
horizontal rule, and hidden-section delimiter silently becomes prose.**
`text.content` also carries the `\r` through to the renderer, and every span
includes it.

The existing test at `lexer.test.ts:464` ("keeps line and offset exact with CRLF
endings") checks only a *heading*, which survives because headings match against
the trimmed line. It gives false confidence.

Fix: strip one trailing `\r` per line while keeping `line.length + 1` span
arithmetic intact.

### B2. Whitespace normalization is inconsistent across token kinds

Recognition happens on `trimmed` (lexer.ts:133) and most kinds store the trimmed
text — but `text` stores the raw line (lexer.ts:309). The parser then re-trims
text lines at `parser.ts:421` and `parser.ts:940` to compensate.

| Token | Payload | Normalized? |
| --- | --- | --- |
| `heading.text` (:236) | from `trimmed` | yes |
| `centered-text.content` (:244) | from `trimmed` | yes |
| `list-item.text` (:277) | `trimmed.slice(2)` | yes |
| `trait-line.traits` (:251) | split, trim, drop empties | yes |
| table cells (:383) | `.trim()` per cell | yes |
| `block-open.raw` (:427) | `.trim()` | yes |
| `text.content` (:309) | raw `line` | **no** |

The consequence that matters: **given a token you cannot recover the sub-span of
its payload.** `heading.text` is `"Title"` while the span covers the whole
physical line including indentation and the `#`. Colouring `#` as a keyword and
`Title` as text requires re-running the same regex over the source.

Addressed by the refactor: store spans plus raw slices, with the normalization
moved to accessors and `splitTraits` / `splitCells` helpers next to the parser.

### B3. Two normalizations lose information irreversibly

- `;a,,b` → `traits: ["a", "b"]`; `;` → `traits: []`. So `;` and `;,,,` are
  indistinguishable, and an empty trait cannot be represented.
- Table cells are trimmed with no per-cell span, so cell-level highlighting has
  to re-scan the line.

These are the two sites where "just stop trimming" is not sufficient — the split
needs a home on the parser side, and the spans need to be emitted as offset
pairs rather than strings.

### B4. `.trim()` at lexer.ts:328 is a no-op

`matchFootnote` receives an already-trimmed line and `(.+)$` cannot capture
trailing whitespace from it. Dead.

---

## C. Tables

### C1. Malformed separators fall through to prose, silently

`isSeparatorRow` (lexer.ts:366) requires the substring `---` *anywhere in the
row* rather than validating each cell.

**Observed:**

| Input | Result |
| --- | --- |
| `A\|B` / `--\|--` / `1\|2` | three `text` tokens — the whole table becomes a paragraph |
| `A \| B` / `--- \| --` | accepted; the second column's `--` is never checked |
| `A\|B` / `\|:\|:\|` | three `text` tokens |

This is the classic markdown table failure mode: the user sees prose where they
wrote a table, with no explanation. Wants per-cell validation
(`/^:?-{3,}:?$/`) and a distinguishable "separator-shaped but invalid" outcome.

### C2. A `|` column break after a table row is eaten as an empty row

```
A|B
---|---
1|2
|
next
```

**Observed:** `table-row` with `cells: [""]`, which then trips `table-ragged-row`
in `parser.ts:627` — reporting a cell-count problem for what the user wrote as a
column break.

### C3. Any line containing `|` after a table row becomes a table row

**Observed:** after a table, `# Head | x` lexes as `table-row` with cells
`["# Head", "x"]`, and `* a | b` likewise. `consumeTableBody` (lexer.ts:355)
should defer to the main line-recognition switch and accept only lines that are
not some other construct.

### C4. Blank lines inside a table body emit no token

`consumeTableBody` (lexer.ts:345-352) skips a run of blanks when a footnote
follows.

**Observed:** for `A|B` / `---|---` / `1|2` / *blank* / `. [*] note`, the token
stream is `table-header, table-sep, table-row, table-footnote` — no `blank`
token for line 4. Every other blank line in a document gets one.

The token stream therefore does not tile the source, which breaks the IntelliJ
lexer contract independently of the tree/stream issue.

### C5. The blank-line lookahead is unbounded

The `peek` loop at lexer.ts:347-348 walks forward over arbitrarily many blank
lines looking for a footnote. A table can absorb a gap of any size. That is a
grammar rule with no bound, and it makes incremental relexing ill-defined.

### C6. `parseAligns` truncates but never pads

`parseAligns` (lexer.ts:386-394) ends with `.slice(0, columnCount)`, discarding
separator columns beyond the header count, and never pads when the separator is
shorter.

**Observed:** `A|B|C` over `---|---` gives `aligns: ["left", "left"]` — shorter
than the column count, leaving the renderer to cope.

Both the decode and the reconciliation belong in the parser.

### C7. Footnotes and rows can interleave

A `. [3] x` footnote followed by another `|` row keeps the table open. Probably
unintended.

---

## D. Layering — logic in the lexer that belongs to the parser

### D1. The lexer produces a tree, not a stream

`tokenizeInto` recurses (lexer.ts:189, 215) and `block-open` / `content-ref`
carry `children`. This is structural parsing performed by a character-level
bracket balancer.

Two consequences:

- It is the direct cause of the silent drop in issue #16 — `parseSegmentsFromTokens`
  receives a `block-open` whose `children` hold a whole subtree and drops it.
- IntelliJ's `Lexer` contract is flat, forward-only, and restartable from any
  token boundary with an integer state. A whole-document recursive function
  returning a tree cannot implement it.

Flattening also deletes `LexCtx` and the id counter (lexer.ts:57, 67), the
`baseOffset`/`baseLine` composition, `captureBalanced` entirely, and the
recursion in `buildTokenMap` (lexer.ts:80).

### D2. The delimiters themselves are consumed and discarded

`block-open` never emits `(`, `)`, `{`, or `}` as tokens. Brace matching and
folding both need them as distinct token types, so the current design cannot
supply what the IDE requires no matter how it is ported.

### D3. Heading level is capped in the lexer

`/^(#{1,6})\s+(.+)$/` (lexer.ts:234) is a language decision made during line
recognition, while `parser.ts:273` already enforces its own cap of 4 with a
diagnostic.

**Observed:** `####### Title` lexes as `text`. No diagnostic anywhere, and in an
editor it would highlight as prose.

Change to `^(#+)\s+(.+)$` and let the parser decide.

### D4. Semantic decoding in the lexer

`parseAligns` produces `Align` values and trait splitting produces `string[]` —
IR vocabulary manufactured during lexing. `lexer.ts:1` imports `Align` from
`./ir`, inverting the layering.

### D5. Table assembly is a mini-parser

`consumeTableBody` (lexer.ts:331-360) decides table membership. Additionally,
the kind of line *N* depends on line *N+1* (lexer.ts:295-306): editing the
separator retroactively changes the previous line's token type.

Line recognition should emit "this line is separator-shaped", "this line has
pipes", "this line is footnote-shaped" and let the parser assemble tables.

### D6. The parser re-lexes things the lexer should have tokenized

- `parser.ts:731` picks the action symbol off an item heading with
  `/\s+(:(?:aaa|aa|a|r|f):)\s*$/` — a lexical detail decided in `parseItem`,
  producing no span. Syntax highlighting needs `:aa:` coloured, so this becomes
  a fourth implementation of the pattern.
- `parser.ts:479` `FOOTNOTE_REF_RE` does cell-level lexing in the parser.

### D7. `parseInline` produces no positional information

`inline.ts:65-119` returns `Inline[]` with zero offsets. Highlighting `**bold**`,
`^sup^`, or `:aa:` requires them, and no layer in the codebase currently produces
them. This is unresolved and needs a decision before the inline half of the
IntelliJ port.

---

## E. Parser defects

### E1. `parseSegmentsFromTokens` drops seven token kinds silently — issue #16

The bare `default:` arm at `parser.ts:1022` drops `trait-line`, `block-open`,
`preamble`, `full-width-toggle`, `hidden-delimiter`, and stray `table-row` /
`table-footnote` with no `warn()` call — nothing on stderr, nothing in
`doc.diagnostics`.

**Observed** for a `rule()` nested inside an `item()`:

```
item(
# Foo
-
Body
rule(
# Inner
Stuff
)
)
```

`doc.diagnostics` is `[]`, and the item's content is a single `Body` paragraph.
`# Inner` and `Stuff` are gone without a trace.

The same construct reports or not depending on its container: `;alpha,beta` at
body level yields `trait-line-outside-item`, but inside `rule()` it yields
nothing.

Fix: explicit cases calling `warn()` with the token's origin, plus a
`const _exhaustive: never` guard so a new token kind becomes a compile error.
The codebase already uses that idiom at `parser.ts:170-173`.

See https://github.com/DreadBoy/glyphmark/issues/16.

### E2. `parseBody` can loop forever

`parseBody` (`parser.ts:219-471`) is a `while` loop over a `switch` with **no
`default:` arm and no exhaustiveness guard**. It happens to cover all 20 current
token kinds. Add a 21st and no case matches, `i` never advances, and the parser
spins. TypeScript will not catch it.

Latent rather than live, but the refactor introduces new token kinds, so this
should be closed in the same pass as E1.

### E3. `warn()` writes to `console.warn`

`parser.ts:79` performs stdio from a pure library function. Aside from the
layering violation, the IntelliJ preview bundle reparses on every keystroke, so
this will spam the IDE console once the plugin ships. Inject the sink and let the
CLI wire up `console.warn`.

### E4. `retargetOrigins` is exhaustive over node types but not containment

`parser.ts:147-175` reaches segments one level down and `rule` → `table` two
levels. If a block ever nests a block, origins silently stay pointed at the
definition site. The `never` guard covers the type axis and gives false
confidence about the containment axis.

---

## F. Contract and API problems

### F1. `TokenId`'s documented contract contradicts the tests

`ir.ts:5-7` says ids are opaque and must never be compared to reconstruct order.
`lexer.test.ts:397-424` asserts exactly that ordering, and the lexer works to
guarantee it (lexer.ts:186, 213).

Pick one before the Kotlin port copies the doc comment across.

### F2. `Origin` + `tokenMap` is indirection with no remaining payoff

`Origin = {first, last}` holds two opaque ids requiring a side-table lookup valid
only for the same parse. The indirection exists so `structuredClone` plus
`retargetOrigins` works for content-ref expansion (`parser.ts:390-394`) — but
retargeting a `{start, end}` range is equally easy.

Replacing `Origin` with a range deletes `TokenId`, `buildTokenMap`, `tokenMap`,
the validity caveat, and every optional-chain at the resolve site. Worth deciding
before the port reproduces the token map in Kotlin.

### F3. `tokenize('')` returns a token

**Observed:** one `blank` token for empty input. IntelliJ lexers must produce
zero tokens for an empty buffer.

---

## G. Dead code

- `block-open.raw` (lexer.ts:198) and `content-ref.content` (lexer.ts:224) have
  no reader outside `lexer.test.ts:461`, which asserts an invariant that exists
  only because the field exists. Both duplicate the source string once per
  nesting level.
- `ALL_KEYWORDS` / `KEYWORD_RE` (lexer.ts:51-52) builds a union regex by string
  concatenation and then re-discriminates with `PREAMBLE_KEYWORDS.includes`
  (lexer.ts:173). Two plain literal regexes read better and port more cleanly.
- Two ways to append a token: `push` (lexer.ts:122) versus the inline
  `tokens.push` at :195 and :221, which bypass it to allocate ids early.

---

## H. Kotlin port hazards

Recorded now so the port does not rediscover them.

### H1. `trim()` and `\s` mean different things on the JVM

JavaScript's `String.trim()` and regex `\s` cover Unicode whitespace including
**U+00A0 NBSP** and **U+FEFF BOM**. Kotlin's `String.trim()` uses
`Character.isWhitespace`, which **excludes NBSP**, and Java's regex `\s` is
`[ \t\n\x0B\f\r]` with no Unicode at all.

**Observed in TS:** a line containing only U+00A0 lexes as `blank`;
`# Title` lexes as a `heading`.

Both would be `text` in a naive Kotlin port. This project has a `pdf2glyph`
pipeline, so PDF-pasted content containing NBSP is a realistic input, not a
hypothetical. Fix on both sides by defining one explicit whitespace class rather
than inheriting each host's default.

### H2. Code-point versus UTF-16 iteration

`for (const ch of line)` (lexer.ts:436) iterates code points, while a Kotlin
`for (c in line)` iterates UTF-16 units. Behaviourally identical here since the
delimiters are ASCII — but the *offsets* matter: TS offsets come from
`slice`/`length` and are UTF-16 indices, so they agree with JVM `String` indices
today. Worth a comment so nobody "fixes" this into code-point offsets and
desyncs the two implementations.

### H3. `GlyphOutline.kt` is already a third copy of this grammar

`apps/intellij-plugin/src/main/kotlin/com/glyphmark/intellij/GlyphOutline.kt`
re-implements the line patterns (`:54-56`) and `captureBalanced` (`:141-158`),
reproducing A5 along the way. It has already drifted: its `INLINE_MARKUP` regex
(`:58`) includes a backtick, for which `inline.ts:18-48` has no delimiter.

It should be *replaced* by the ported lexer, not maintained alongside it.

---

## Tests that will need rewriting rather than porting

- `lexer.test.ts:461` — asserts the `raw` ↔ `children` invariant, which only
  exists because `raw` exists (see G).
- `lexer.test.ts:464` — the CRLF test that does not test what it claims (see B1).
