package com.glyphmark.intellij

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.fileTypes.PlainTextLanguage
import javax.swing.Icon

/**
 * File type for `.glyph` sources.
 *
 * Backed by [PlainTextLanguage] rather than a language of its own: this first
 * version ships the preview only, so it reuses plain text's parser definition
 * and highlighting instead of declaring a Glyph lexer that does nothing yet.
 * Introducing a dedicated `Language` is what syntax highlighting would need.
 */
class GlyphFileType private constructor() : LanguageFileType(PlainTextLanguage.INSTANCE, true) {

    override fun getName(): String = "Glyph"

    override fun getDescription(): String = "Glyph markup"

    override fun getDefaultExtension(): String = "glyph"

    override fun getIcon(): Icon = AllIcons.FileTypes.Text

    companion object {
        @JvmField
        val INSTANCE: GlyphFileType = GlyphFileType()
    }
}
