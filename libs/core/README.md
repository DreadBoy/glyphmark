# Glyphmark core library

## Supported blocks

There seems to be
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

## Syntax that still needs to be decided and implemented
* drop-caps (38)
* rich rules (188, 268)
* rich info (93, 401)
* custom flow-around image (83, 223, 427, 428)
