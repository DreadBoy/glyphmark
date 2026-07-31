package com.glyphmark.intellij

import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.options.colors.AttributesDescriptor
import com.intellij.openapi.options.colors.ColorDescriptor
import com.intellij.openapi.options.colors.ColorSettingsPage
import javax.swing.Icon

/**
 * The Glyph page under Settings | Editor | Color Scheme.
 *
 * Without this the highlighting still works, but its colours are invisible to
 * the user and unchangeable — the scheme editor only lists keys some page
 * declares. The sample below is shown live in that dialog, so it deliberately
 * exercises every token type at least once.
 */
class GlyphColorSettingsPage : ColorSettingsPage {

    override fun getDisplayName(): String = "Glyph"

    override fun getIcon(): Icon? = null

    override fun getHighlighter(): SyntaxHighlighter = GlyphSyntaxHighlighter()

    override fun getAttributeDescriptors(): Array<AttributesDescriptor> = DESCRIPTORS

    override fun getColorDescriptors(): Array<ColorDescriptor> = ColorDescriptor.EMPTY_ARRAY

    override fun getAdditionalHighlightingTagToDescriptorMap():
        MutableMap<String, TextAttributesKey>? = null

    override fun getDemoText(): String = DEMO

    private companion object {
        val DESCRIPTORS = arrayOf(
            AttributesDescriptor("Block keyword", GlyphSyntaxHighlighter.KEYWORD_KEY),
            AttributesDescriptor("Delimiters", GlyphSyntaxHighlighter.DELIMITER_KEY),
            AttributesDescriptor("Heading//Marker", GlyphSyntaxHighlighter.HEADING_MARKER_KEY),
            AttributesDescriptor("Heading//Text", GlyphSyntaxHighlighter.HEADING_TEXT_KEY),
            AttributesDescriptor("Line markers", GlyphSyntaxHighlighter.MARKER_KEY),
            AttributesDescriptor("Bullet marker", GlyphSyntaxHighlighter.LIST_MARKER_KEY),
            AttributesDescriptor("Page and column breaks", GlyphSyntaxHighlighter.LONE_MARKER_KEY),
            AttributesDescriptor("Trait line", GlyphSyntaxHighlighter.TRAIT_KEY),
            AttributesDescriptor("Content reference key", GlyphSyntaxHighlighter.REFERENCE_KEY_KEY),
            AttributesDescriptor("Table//Cell separator", GlyphSyntaxHighlighter.PIPE_KEY),
            AttributesDescriptor("Table//Footnote marker", GlyphSyntaxHighlighter.FOOTNOTE_MARKER_KEY),
            AttributesDescriptor("Inline//Delimiters", GlyphSyntaxHighlighter.INLINE_MARKER_KEY),
            AttributesDescriptor("Inline//Bold", GlyphSyntaxHighlighter.STRONG_KEY),
            AttributesDescriptor("Inline//Italic", GlyphSyntaxHighlighter.EM_KEY),
            AttributesDescriptor("Inline//Bold italic", GlyphSyntaxHighlighter.STRONG_EM_KEY),
            AttributesDescriptor("Inline//Superscript", GlyphSyntaxHighlighter.SUP_KEY),
            AttributesDescriptor("Inline//Subscript", GlyphSyntaxHighlighter.SUB_KEY),
            AttributesDescriptor("Inline//Action symbol", GlyphSyntaxHighlighter.ACTION_SYMBOL_KEY),
        )

        val DEMO = """
            head(
            # Faiths and Philosophies
            )

            Body prose runs as plain text, wrapping across as many lines as it
            needs to.

            item(
            # Shield Block
            -
            ;general,manipulate
            **Trigger** While you have a shield raised, a creature hits you.
            You snap your shield into place, taking *reduced* damage :aa: and
            noting the H^2^O and CO~2~ readings. ***Critical failure*** ends it.
            )

            rule(
            ## Materials
            Material | Hardness | HP
            --- | :--: | :--:
            Cloth | 1 | 4
            . [*] Values assume a standard-grade item.
            )

            * A bullet in a list
            ^ Centered text inside a sample block

            =
            |
            /

            blurb {
            Reusable content, defined once.
            }

            {{blurb}}
        """.trimIndent()
    }
}
