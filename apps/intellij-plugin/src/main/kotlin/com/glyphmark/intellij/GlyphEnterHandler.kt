package com.glyphmark.intellij

import com.intellij.codeInsight.editorActions.enter.EnterHandlerDelegate
import com.intellij.codeInsight.editorActions.enter.EnterHandlerDelegateAdapter
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.util.Ref
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiFile

/**
 * Carries a bullet onto the next line when you press Enter inside a list, and
 * drops it again when you press Enter on an empty one.
 *
 * Registered globally rather than per language — `.glyph` files are plain text
 * to the IDE, so there is no Glyph language to hang this off — hence the file
 * type check on the way in.
 *
 * The document is mutated directly here, unlike [GlyphMarkupAction], which wraps
 * its edit in a `WriteCommandAction`. That difference is deliberate: the
 * platform already invokes these callbacks inside the write action and the
 * command that Enter opened, so starting another command would nest one inside
 * the other and split a single keystroke across two undo steps.
 */
class GlyphEnterHandler : EnterHandlerDelegateAdapter(), DumbAware {

    /**
     * Ending the list has to happen *before* the newline is inserted: the point
     * is to strip the empty bullet and stay put, not to leave it behind and open
     * another line under it.
     */
    override fun preprocessEnter(
        file: PsiFile,
        editor: Editor,
        caretOffset: Ref<Int>,
        caretAdvance: Ref<Int>,
        dataContext: DataContext,
        originalHandler: EditorActionHandler?,
    ): EnterHandlerDelegate.Result {
        if (!isGlyphFile(file)) return EnterHandlerDelegate.Result.Continue
        // Enter with a selection replaces it; that isn't a list gesture, and
        // deleting the line under one caret would strand the other end.
        if (editor.selectionModel.hasSelection()) return EnterHandlerDelegate.Result.Continue

        val document = editor.document
        val offset = caretOffset.get()
        val line = document.getLineNumber(offset)
        val start = document.getLineStartOffset(line)
        val end = document.getLineEndOffset(line)
        val markerEnd = GlyphEdits.emptyListItemEnd(document.getText(TextRange(start, end)))
            ?: return EnterHandlerDelegate.Result.Continue
        // Inside the marker itself (`|* ` or `*| `) Enter still means "split the
        // line", not "leave the list".
        if (offset - start < markerEnd) return EnterHandlerDelegate.Result.Continue

        document.deleteString(start, end)
        editor.caretModel.moveToOffset(start)
        return EnterHandlerDelegate.Result.Stop
    }

    /**
     * Continuing a list happens after the fact, once the platform has opened the
     * new line — the bullet then replaces whatever indent it decided to carry
     * over, so the two never stack up.
     */
    override fun postProcessEnter(
        file: PsiFile,
        editor: Editor,
        dataContext: DataContext,
    ): EnterHandlerDelegate.Result {
        if (!isGlyphFile(file)) return EnterHandlerDelegate.Result.Continue

        val document = editor.document
        val offset = editor.caretModel.offset
        val line = document.getLineNumber(offset)
        if (line == 0) return EnterHandlerDelegate.Result.Continue

        val previousStart = document.getLineStartOffset(line - 1)
        val previousEnd = document.getLineEndOffset(line - 1)
        val previous = document.getText(TextRange(previousStart, previousEnd))
        val bullet = GlyphEdits.listContinuation(previous) ?: return EnterHandlerDelegate.Result.Continue

        val lineStart = document.getLineStartOffset(line)
        document.replaceString(lineStart, offset, bullet)
        editor.caretModel.moveToOffset(lineStart + bullet.length)
        return EnterHandlerDelegate.Result.Stop
    }

    private fun isGlyphFile(file: PsiFile): Boolean =
        file.viewProvider.virtualFile.fileType == GlyphFileType.INSTANCE
}
