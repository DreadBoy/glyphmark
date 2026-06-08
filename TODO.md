# Glyphmark TODO

## Supported blocks

Currently supported blocks

* [x] headers (h1-h4) (39)
  * can have images that act as decorated first letter (38)
* [x] sample/example block (page 228)
  * have 2 levels of heading (276).
* [x] math / formula (275)
  * math seems visually similar to sample, just without heading and with centered text. Does it warrant separate block type? Specially because sample could also contain centered text that looks like formula (276)
* [x] table (274)
  * can be column-wide (270) or full-wide (274). Tables can also have footnotes (270, 274)
* [x] item block (also used for spells, monsters, feats etc.) (102)
  * has a heading, optional subheading, optional action icon
  * horizontal line below the heading
  * has optional traits
  * no horizontal line below the traits
  * at least 1 section, multiple of them separated by horizontal line
* [x] unordered list
  * can appear in normal text (244), items (259), rules (245)
* [x] column break
  * indicates start of new column
* [x] horizontal lines don't appear anywhere except as part of item block.
* [x] head (50), sometimes with description (84)
* [x] GM advice / rule explanation (230, 232)
  * [x] have 2 levels of heading (245)
  * [x] can be very rich (188, 268) - won't do for now
  * [x] can have a table (272).
* [x] callout / info (rarely used, 165)
  * can be rich (93)
* [x] page break
  * I couldn't find page break in wild, the closest is (75) but it coveres lack of text with an image
  * still, let's implement it
* [x] content reference
  * wrap the reference in `key {}` and later reuse with `{{key}}`

## On paragraphs indents
In normal text, paragraphs, except first one, are indented in first line (274). Lists are indented in all lines of the list, also if they are first paragraph (109). Paragraphs with bolded first words are indented just in first line (274). 

In item block, first paragraph isn't indented in first line while each following paragraph is. This resets after <hr>. If it starts with bolded words, it is indented in every line except first line. Page 247 demonstrates indented paragraph, followed by bolded paragraph.  
In item block, lists are indented as well. (259, Pet).

In rule block, 2nd+ paragraphs are indented as well (245), bolded as well (232), lists are not (245).

In sample block, bolded paragraphs are not indented (231).

## Block that are planned
* [ ] page chrome
  * using pagenumbers attribute
  * decided to skip for now as it's complicated and less usefull for shorter documents
* [ ] right sidebar (43, 123)
  * right() 
  * there doesn't appear to be left sidebar
* [ ] item block interrupted by other blocks (eg. rule ) (245)
* [ ] item in rule
* [ ] rule with hr, also heading hr (190)
* [ ] rule with full-width and column layout (445)
* [ ] table with multiple non-numeric footnotes (111)
* [ ] custom css and fonts (423, 429)
* [ ] custom images (255)

## Known bugs

### Full-width rule block detaches from its toggle across a page break

A full-width rule block (`/ … rule(…) /`) loses its full-width layout and
fragments into the regular 2-column flow when it lands near a page boundary.
Observed in Player Core: "KEY TERMS" renders correctly (full-width band, inner
2 columns) but "Level" right after it breaks into two brown blocks, each with
its own 2 columns of text. Both rules are identical in the parsed IR
(`fullWidth=true`, one column-break each) — the bug is purely in rendering.

**Cause.** Full-width is implemented by `FullWidthToggle` emitting an empty
marker `<div class="gm-fw-N">` plus a global rule `.gm-fw-N ~ * { column-span:
all|none }` (`components/full-width-toggle.tsx`). It only works while the marker
and the content stay siblings on the same page. The "Level" box is ~931px tall
vs ~916px usable page height, and `RuleBlock` sets `break-inside: avoid`
(`components/rule-block.tsx`), so Paged.js pushes the whole box to the next
page — leaving the zero-height marker behind on the previous page. On the new
page nothing matches `.gm-fw-N ~ *`, so `column-span` reverts to `none`: the box
drops into the page's 2-column flow and fragments, while `node.fullWidth` still
applies its own inner `columnCount: 2` — hence two brown blocks each with 2
columns. "KEY TERMS" only escapes because its box (~900px) just fits.

**Proposed fix.** Stop relying on the `~` sibling cascade. In the renderer,
group the body nodes between a toggle pair into a real wrapper
`<div css={{ columnSpan: 'all' }}>`. Paged.js clones ancestor containers across
page fragments, so the span survives wherever the content lands. Goldens should
be unaffected (verify via the suite).

**Caveat.** "Level" still overflows one page (931 > 916px); a span-all box
taller than a page can't honor `break-inside: avoid`. Separately decide whether
tall full-width rule blocks should fragment vertically across pages (likely
correct) or have their content trimmed.

## Syntax that still needs to be decided and implemented
* drop-caps (38)
* rich rules (188, 268)
* rich info (93, 401)
* custom flow-around image (83, 223, 427, 428)
