package com.glyphmark.intellij

import com.intellij.openapi.editor.colors.EditorColorsScheme
import com.intellij.openapi.editor.ex.util.LexerEditorHighlighter
import com.intellij.openapi.editor.highlighter.EditorHighlighter
import com.intellij.openapi.fileTypes.EditorHighlighterProvider
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Wires [GlyphSyntaxHighlighter] to `.glyph` files.
 *
 * The usual route for this is `lang.syntaxHighlighterFactory`, which is keyed by
 * `Language`. `GlyphFileType` deliberately has none — it is a *secondary* file
 * type for plain text (see `GlyphFileType`), which is what lets the platform's
 * plain-text behaviour still apply. `editorHighlighterProvider` is the
 * file-type-keyed equivalent, so it is the one that fits.
 */
class GlyphEditorHighlighterProvider : EditorHighlighterProvider {
    override fun getEditorHighlighter(
        project: Project?,
        fileType: FileType,
        virtualFile: VirtualFile?,
        colors: EditorColorsScheme,
    ): EditorHighlighter = LexerEditorHighlighter(GlyphSyntaxHighlighter(), colors)
}
