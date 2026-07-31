package com.glyphmark.intellij

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GlyphEditsTest {

    /**
     * Runs an edit over text whose caret is written as `|` (twice for a
     * selection) and returns the result in the same notation, so a test reads as
     * before/after source.
     */
    private fun edit(marked: String, action: (CharSequence, Int, Int) -> GlyphEdit?): String? {
        val start = marked.indexOf('|')
        val end = marked.indexOf('|', start + 1).let { if (it < 0) start else it - 1 }
        val text = marked.replace("|", "")
        val result = action(text, start, end) ?: return null

        val builder = StringBuilder(text)
        for (replacement in result.replacements.asReversed()) {
            builder.replace(replacement.start, replacement.end, replacement.text)
        }
        if (result.selectionEnd > result.selectionStart) builder.insert(result.selectionEnd, '|')
        builder.insert(result.selectionStart, '|')
        return builder.toString()
    }

    // -- emphasis ------------------------------------------------------------

    @Test
    fun `wraps a selection in bold`() {
        assertEquals("A **|critical|** hit", edit("A |critical| hit", GlyphEdits::toggleStrong))
    }

    @Test
    fun `bolds the word under the caret when nothing is selected`() {
        assertEquals("A **|critical|** hit", edit("A criti|cal hit", GlyphEdits::toggleStrong))
    }

    @Test
    fun `inserts an empty pair when the caret has no word`() {
        assertEquals("A **|**", edit("A |", GlyphEdits::toggleStrong))
    }

    @Test
    fun `unwraps bold whether the delimiters are inside or outside the selection`() {
        assertEquals("A |critical| hit", edit("A **|critical|** hit", GlyphEdits::toggleStrong))
        assertEquals("A |critical| hit", edit("A |**critical**| hit", GlyphEdits::toggleStrong))
    }

    @Test
    fun `promotes italic to bold-italic rather than nesting`() {
        // The parser keeps a `*` inside `**…**` literal, so combined emphasis is
        // only ever the triple form.
        assertEquals("***|critical|***", edit("*|critical|*", GlyphEdits::toggleStrong))
        assertEquals("**|critical|**", edit("***|critical|***", GlyphEdits::toggleEm))
        assertEquals("*|critical|*", edit("***|critical|***", GlyphEdits::toggleStrong))
    }

    @Test
    fun `recognises underscore emphasis and keeps its spelling`() {
        assertEquals("___|critical|___", edit("_|critical|_", GlyphEdits::toggleStrong))
        assertEquals("_|critical|_", edit("___|critical|___", GlyphEdits::toggleStrong))
        assertEquals("|critical|", edit("__|critical|__", GlyphEdits::toggleStrong))
    }

    @Test
    fun `toggles superscript and subscript`() {
        assertEquals("H~|2|~O", edit("H|2|O", GlyphEdits::toggleSubscript))
        assertEquals("H|2|O", edit("H~|2|~O", GlyphEdits::toggleSubscript))
        assertEquals("x^|2|^", edit("x|2|", GlyphEdits::toggleSuperscript))
    }

    @Test
    fun `leaves surrounding whitespace outside the delimiters`() {
        assertEquals("A **|critical|** hit", edit("A |critical |hit", GlyphEdits::toggleStrong))
    }

    @Test
    fun `wraps each line of a multi-line selection`() {
        // Emphasis never spans a newline, but a source paragraph does — the
        // lexer joins its lines back together.
        assertEquals(
            "**|one**\n**two|**",
            edit("|one\ntwo|", GlyphEdits::toggleStrong),
        )
    }

    @Test
    fun `adds emphasis to a mixed selection rather than half-removing it`() {
        assertEquals(
            "**|one**\n**two|**",
            edit("|**one**\ntwo|", GlyphEdits::toggleStrong),
        )
    }

    @Test
    fun `does nothing for a whitespace-only selection`() {
        assertNull(edit("a |  | b", GlyphEdits::toggleStrong))
    }

    @Test
    fun `refuses to write a delimiter against an existing one`() {
        // Each of these used to merge the new delimiter into the neighbouring
        // run, producing markup the parser reads as something else — e.g.
        // `*|hello| world*` bolded became `***hello** world*`, i.e. strong
        // `*hello` plus literal text.
        assertNull(edit("*|hello| world*", GlyphEdits::toggleStrong))
        assertNull(edit("*hello |world|*", GlyphEdits::toggleStrong))
        assertNull(edit("**|hello| world**", GlyphEdits::toggleEm))
    }

    @Test
    fun `refuses when the caret merely sits beside existing emphasis`() {
        // The caret cases are the dangerous ones: no selection, so the user
        // isn't looking at what would be rewritten.
        assertNull(edit("|**bold**", GlyphEdits::toggleStrong))
        assertNull(edit("x^2^|", GlyphEdits::toggleSuperscript))
    }

    @Test
    fun `refuses to wrap text that already holds a delimiter`() {
        // Emphasis doesn't nest, so `**` around `*a*` would render the inner
        // asterisks literally rather than italicising.
        assertNull(edit("x |*a* and b| y", GlyphEdits::toggleStrong))
        assertNull(edit("a |****| b", GlyphEdits::toggleStrong))
    }

    @Test
    fun `refuses a selection that splits a delimiter run`() {
        assertNull(edit("|**bold*|*", GlyphEdits::toggleStrong))
    }

    @Test
    fun `still wraps text containing the other spelling of emphasis`() {
        // `_` is a delimiter too, but a lone one is literal to the parser, so
        // bolding an identifier must keep working.
        assertEquals("**|snake_case|**", edit("|snake_case|", GlyphEdits::toggleStrong))
    }

    @Test
    fun `composes bold and italic into the triple form`() {
        // Why there is no combined action: the two toggles reach `***` on their
        // own, from either direction.
        assertEquals("***|hit|***", edit("*|hit|*", GlyphEdits::toggleStrong))
        assertEquals("***|hit|***", edit("**|hit|**", GlyphEdits::toggleEm))
    }

    // -- list continuation ---------------------------------------------------

    @Test
    fun `continues a list with its own marker and indent`() {
        assertEquals("* ", GlyphEdits.listContinuation("* Buckler"))
        assertEquals("- ", GlyphEdits.listContinuation("- Buckler"))
        assertEquals("  * ", GlyphEdits.listContinuation("  * Buckler"))
    }

    @Test
    fun `does not continue a non-list line`() {
        assertNull(GlyphEdits.listContinuation("Just prose"))
        assertNull(GlyphEdits.listContinuation(""))
    }

    @Test
    fun `requires a space after the marker, matching the lexer`() {
        // `lexer.ts` tests `trimmed.startsWith('* ')`, so a tab makes the line
        // prose. Continuing it would teach a syntax the renderer ignores.
        assertNull(GlyphEdits.listContinuation("*\tBuckler"))
        assertNull(GlyphEdits.emptyListItemEnd("*\t"))
    }

    @Test
    fun `treats a lone dash as an hr, not a list`() {
        // `-` alone is the item separator the parser requires; continuing it
        // would turn a section divider into a bullet.
        assertNull(GlyphEdits.listContinuation("-"))
        assertNull(GlyphEdits.emptyListItemEnd("-"))
    }

    @Test
    fun `reports where an empty bullet's marker ends`() {
        assertEquals(2, GlyphEdits.emptyListItemEnd("* "))
        assertEquals(4, GlyphEdits.emptyListItemEnd("  - "))
        assertNull(GlyphEdits.emptyListItemEnd("* Buckler"))
    }

    @Test
    fun `continues a bullet whose body was just split away`() {
        // Enter in `* |foo` leaves `* ` behind; the new line is still part of
        // the list, so it must carry a bullet rather than becoming prose.
        assertEquals("* ", GlyphEdits.listContinuation("* "))
    }
}
