# About block names

There seems to be
* [x] headers (h1-h4) (39)
  * can have images that act as decorated first letter (38)
* [x] sample/example block (page 228)
  * have 2 levels of heading (276).
* [x] math / formula (275)
  * math seems visually similar to sample, just without heading and with centered text. Does it warrant separate block type? Specially because sample could also contain centered text that looks like formula (276)
* [ ] GM advice / rule explanation (230, 232)
  * [x] have 2 levels of heading (245)
  * [ ] can be very rich (188, 268)
  * [x] can have a table (272).
* [ ] callout / info (rarely used, 165)
  * can be rich (93)
* [x] table (274)
  * can be column-wide (270) or full-wide (274). Tables can also have footnotes (270, 274)
* [ ] item block (also used for spells, monsters, feats etc.) (102)
  * has a heading, optional subheading, optional action icon
  * horizontal line below the heading
  * has optional traits
  * no horizontal line below the traits
  * at least 1 section, multiple of them separated by horizontal line 
* [ ] head (50), sometimes with description (84)
* [ ] right sidebar (123)
  * there doesn't appear to be left sidebar
* [ ] horizontal lines don't appear anywhere except as part of item block.
* [x] column break
  * indicates start of new column
* [ ] page break
  * I couldn't find page break in wild, the closest is (75) but it coveres lack of text with an image
  * still, let's implement it
* [ ] unordered list
  * can appear in normal text (244), items (259), rules (245)

# On paragraphs indents
In normal text, paragraphs, except first one, are indented in first line (274). Lists are indented in all lines of the list, also if they are first paragraph (109). Paragraphs with bolded first words are indented just in first line (274). 

In item block, first paragraph isn't indented in first line while each following paragraph is. This resets after <hr>. If it starts with bolded words, it is indented in every line except first line. Page 247 demonstrates indented paragraph, followed by bolded paragraph.  
In item block, lists are indented as well. (259, Pet).

In rule block, 2nd+ paragraphs are indented as well (245), bolded as well (232), lists are not (245).

In sample block, bolded paragraphs are not indented (231).

# Glyphmark syntax
Will also include

* page break
  * not found in the source book but I think it will useful for me
* content reference
  * wrap the reference in `<key> {}` and later reuse with `{{key}}`

# Syntax that still needs to be decided
* drop-caps (38)
* rich rules (188, 268)
* rich info (93)
