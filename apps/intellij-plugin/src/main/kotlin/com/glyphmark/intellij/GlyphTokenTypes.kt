package com.glyphmark.intellij

import com.intellij.psi.tree.IElementType

/**
 * The element types the highlighting lexer emits.
 *
 * These are highlighting categories, not grammar: the set is chosen by what
 * deserves a different colour, which is why a heading's `#` and its text are
 * separate types while a table's header row and data rows are not — an editor
 * colours those identically, and telling them apart needs surrounding lines.
 *
 * `null` for the language: `GlyphFileType` is a secondary file type for plain
 * text rather than a `LanguageFileType`, so there is no `Language` to attach
 * these to. The platform treats that as [com.intellij.lang.Language.ANY], which
 * is all a lexer-based highlighter needs.
 */
object GlyphTokenTypes {
    /** Block keyword: the `item` in `item(`. */
    val KEYWORD = IElementType("GLYPH_KEYWORD", null)

    /** Structural punctuation: `(`, `)`, `{`, `}`. */
    val DELIMITER = IElementType("GLYPH_DELIMITER", null)

    /** A line that is one symbol: `=`, `|`, `/`, `-`, `%`. */
    val LONE_MARKER = IElementType("GLYPH_LONE_MARKER", null)

    /** The `#`s opening a heading. */
    val HEADING_MARKER = IElementType("GLYPH_HEADING_MARKER", null)

    /** A heading's text. */
    val HEADING_TEXT = IElementType("GLYPH_HEADING_TEXT", null)

    /** A marker that introduces content on the same line: `^`, `{{`, `. [n]`. */
    val MARKER = IElementType("GLYPH_MARKER", null)

    /** The `*` or `-` opening a bullet. Its own type so bullets can be spotted
     *  at a glance, the way a markdown editor picks them out. */
    val LIST_MARKER = IElementType("GLYPH_LIST_MARKER", null)

    /** A `;a,b` trait line, marker and all. */
    val TRAIT = IElementType("GLYPH_TRAIT", null)

    /** The key inside `{{key}}` or opening a `key {` definition. */
    val REFERENCE_KEY = IElementType("GLYPH_REFERENCE_KEY", null)

    /** A `|` separating cells. */
    val PIPE = IElementType("GLYPH_PIPE", null)

    /** The marker inside a footnote's brackets. */
    val FOOTNOTE_MARKER = IElementType("GLYPH_FOOTNOTE_MARKER", null)

    /** Ordinary prose. */
    val TEXT = IElementType("GLYPH_TEXT", null)

    /** The `**`, `*`, `^` or `~` around an emphasis run. */
    val INLINE_MARKER = IElementType("GLYPH_INLINE_MARKER", null)

    /** Text inside `**…**`. */
    val STRONG = IElementType("GLYPH_STRONG", null)

    /** Text inside `*…*`. */
    val EM = IElementType("GLYPH_EM", null)

    /** Text inside `***…***`. */
    val STRONG_EM = IElementType("GLYPH_STRONG_EM", null)

    /** Text inside `^…^`. */
    val SUP = IElementType("GLYPH_SUP", null)

    /** Text inside `~…~`. */
    val SUB = IElementType("GLYPH_SUB", null)

    /** An action symbol such as `:aa:`. */
    val ACTION_SYMBOL = IElementType("GLYPH_ACTION_SYMBOL", null)
}
