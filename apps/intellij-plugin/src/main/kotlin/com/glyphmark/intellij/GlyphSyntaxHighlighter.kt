package com.glyphmark.intellij

import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.psi.tree.IElementType
import java.awt.Font

/**
 * Maps Glyph token types onto colours.
 *
 * Every key inherits from the **Markdown** plugin's colours rather than from
 * `DefaultLanguageHighlighterColors`. Glyph is prose markup, so a reader's
 * expectations come from markdown, not from source code: heading markers should
 * recede the way `#` does, table pipes should be the quiet grey markdown uses
 * rather than an operator colour, and bullets should be picked out the same way.
 * Themes style markdown deliberately, so inheriting means Glyph follows
 * whichever theme is in use instead of guessing at colours of its own.
 *
 * The keys are referenced by external name through [TextAttributesKey.find]
 * rather than by importing `MarkdownHighlighterColors`, so this does not depend
 * on the Markdown plugin. Markdown ships with every IDE but can be disabled; if
 * it is, these resolve to no attributes and the text simply renders plain
 * instead of the plugin failing to load.
 *
 * Users can override any of it under Settings | Editor | Color Scheme | Glyph —
 * see [GlyphColorSettingsPage].
 */
class GlyphSyntaxHighlighter : SyntaxHighlighterBase() {

    override fun getHighlightingLexer(): Lexer = GlyphHighlightingLexer()

    override fun getTokenHighlights(tokenType: IElementType?): Array<TextAttributesKey> =
        when (tokenType) {
            GlyphTokenTypes.KEYWORD -> KEYWORD
            GlyphTokenTypes.DELIMITER -> DELIMITER
            GlyphTokenTypes.LONE_MARKER -> LONE_MARKER
            GlyphTokenTypes.HEADING_MARKER -> HEADING_MARKER
            GlyphTokenTypes.HEADING_TEXT -> HEADING_TEXT
            GlyphTokenTypes.MARKER -> MARKER
            GlyphTokenTypes.LIST_MARKER -> LIST_MARKER
            GlyphTokenTypes.TRAIT -> TRAIT
            GlyphTokenTypes.REFERENCE_KEY -> REFERENCE_KEY
            GlyphTokenTypes.PIPE -> PIPE
            GlyphTokenTypes.FOOTNOTE_MARKER -> FOOTNOTE_MARKER
            GlyphTokenTypes.INLINE_MARKER -> INLINE_MARKER
            GlyphTokenTypes.STRONG -> STRONG
            GlyphTokenTypes.EM -> EM
            GlyphTokenTypes.STRONG_EM -> STRONG_EM
            GlyphTokenTypes.SUP -> SUP
            GlyphTokenTypes.SUB -> SUB
            GlyphTokenTypes.ACTION_SYMBOL -> ACTION_SYMBOL
            else -> EMPTY
        }

    companion object {
        /**
         * A Markdown colour, by external name.
         *
         * `find` returns the registered key when the Markdown plugin is loaded
         * and an attribute-less placeholder when it is not, which is the
         * graceful degradation described on the class.
         */
        private fun markdown(name: String) = TextAttributesKey.find(name)

        private fun key(name: String, fallback: TextAttributesKey) =
            TextAttributesKey.createTextAttributesKey(name, fallback)

        /**
         * A key whose default is a font style rather than an inherited colour.
         *
         * Used only where markdown has no equivalent. Leaving the colours null
         * means the text keeps its surrounding foreground and only the weight
         * changes, so emphasis inside a heading still reads as heading text.
         */
        private fun styleKey(name: String, style: Int) =
            TextAttributesKey.createTextAttributesKey(
                name,
                TextAttributes(null, null, null, null, style),
            )

        // A `keyword(` opener is Glyph's closest thing to a fenced block: a
        // named container with punctuation around the name.
        val KEYWORD_KEY = key("GLYPH_KEYWORD", markdown("MARKDOWN_CODE_FENCE_LANGUAGE"))
        val DELIMITER_KEY = key("GLYPH_DELIMITER", markdown("MARKDOWN_CODE_FENCE_MARKER"))

        // `=`, `|`, `/`, `-`, `%` are each a line that is purely a rule.
        val LONE_MARKER_KEY = key("GLYPH_LONE_MARKER", markdown("MARKDOWN_HRULE"))

        val HEADING_MARKER_KEY =
            key("GLYPH_HEADING_MARKER", markdown("MARKDOWN_HEADER_MARKER"))
        val HEADING_TEXT_KEY =
            key("GLYPH_HEADING_TEXT", markdown("MARKDOWN_HEADER_LEVEL_1"))

        val MARKER_KEY = key("GLYPH_MARKER", markdown("MARKDOWN_BLOCK_QUOTE_MARKER"))
        val LIST_MARKER_KEY = key("GLYPH_LIST_MARKER", markdown("MARKDOWN_LIST_MARKER"))

        val TRAIT_KEY = key("GLYPH_TRAIT", markdown("MARKDOWN_LINK_DEFINITION"))
        val REFERENCE_KEY_KEY =
            key("GLYPH_REFERENCE_KEY", markdown("MARKDOWN_LINK_DEFINITION"))

        // The quiet grey markdown gives table pipes.
        val PIPE_KEY = key("GLYPH_PIPE", markdown("MARKDOWN_TABLE_SEPARATOR"))
        val FOOTNOTE_MARKER_KEY =
            key("GLYPH_FOOTNOTE_MARKER", markdown("MARKDOWN_LINK_DEFINITION"))

        val INLINE_MARKER_KEY =
            key("GLYPH_INLINE_MARKER", markdown("MARKDOWN_BOLD_MARKER"))
        val STRONG_KEY = key("GLYPH_STRONG", markdown("MARKDOWN_BOLD"))
        val EM_KEY = key("GLYPH_EM", markdown("MARKDOWN_ITALIC"))

        // Markdown has no combined bold-italic key, so this is the one place a
        // style is spelled out rather than inherited.
        val STRONG_EM_KEY = styleKey("GLYPH_STRONG_EM", Font.BOLD or Font.ITALIC)

        // Nor superscript or subscript; a code span is the nearest thing —
        // inline text set apart from the prose around it.
        val SUP_KEY = key("GLYPH_SUP", markdown("MARKDOWN_CODE_SPAN"))
        val SUB_KEY = key("GLYPH_SUB", markdown("MARKDOWN_CODE_SPAN"))
        val ACTION_SYMBOL_KEY =
            key("GLYPH_ACTION_SYMBOL", markdown("MARKDOWN_CODE_SPAN"))

        private val EMPTY = emptyArray<TextAttributesKey>()
        private val KEYWORD = arrayOf(KEYWORD_KEY)
        private val DELIMITER = arrayOf(DELIMITER_KEY)
        private val LONE_MARKER = arrayOf(LONE_MARKER_KEY)
        private val HEADING_MARKER = arrayOf(HEADING_MARKER_KEY)
        private val HEADING_TEXT = arrayOf(HEADING_TEXT_KEY)
        private val MARKER = arrayOf(MARKER_KEY)
        private val LIST_MARKER = arrayOf(LIST_MARKER_KEY)
        private val TRAIT = arrayOf(TRAIT_KEY)
        private val REFERENCE_KEY = arrayOf(REFERENCE_KEY_KEY)
        private val PIPE = arrayOf(PIPE_KEY)
        private val FOOTNOTE_MARKER = arrayOf(FOOTNOTE_MARKER_KEY)
        private val INLINE_MARKER = arrayOf(INLINE_MARKER_KEY)
        private val STRONG = arrayOf(STRONG_KEY)
        private val EM = arrayOf(EM_KEY)
        private val STRONG_EM = arrayOf(STRONG_EM_KEY)
        private val SUP = arrayOf(SUP_KEY)
        private val SUB = arrayOf(SUB_KEY)
        private val ACTION_SYMBOL = arrayOf(ACTION_SYMBOL_KEY)
    }
}
