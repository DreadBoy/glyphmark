package com.glyphmark.intellij

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.DumbAware

/**
 * Base for the `.glyph` markup actions: read the caret, ask [GlyphEdits] what
 * the document should become, apply it as one undoable command.
 *
 * Only the primary caret is used. Multi-caret markup editing would need the
 * edits of every caret rebased onto each other, and the actions here are worth
 * more than that complexity is.
 */
abstract class GlyphMarkupAction : AnAction(), DumbAware {

    /** Null when the action has nothing to do at this caret. */
    protected abstract fun edit(text: CharSequence, start: Int, end: Int): GlyphEdit?

    // Reading the file type off the event needs no PSI, so the update can stay
    // off the EDT.
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    /**
     * Hidden outside `.glyph` files, so the group collapses to nothing in menus
     * for every other file type.
     *
     * The file comes from the document rather than from `VIRTUAL_FILE` in the
     * data context, because `.glyph` opens in a [GlyphEditorWithPreview] split
     * and the composite doesn't reliably supply that key.
     */
    override fun update(event: AnActionEvent) {
        val editor = event.getData(CommonDataKeys.EDITOR)
        val file = editor?.let { FileDocumentManager.getInstance().getFile(it.document) }
        event.presentation.isEnabledAndVisible =
            editor != null && editor.document.isWritable && file?.fileType == GlyphFileType.INSTANCE
    }

    override fun actionPerformed(event: AnActionEvent) {
        val editor: Editor = event.getData(CommonDataKeys.EDITOR) ?: return
        val document = editor.document
        val caret = editor.caretModel.primaryCaret
        val result = edit(document.charsSequence, caret.selectionStart, caret.selectionEnd) ?: return

        WriteCommandAction.runWriteCommandAction(event.project, templatePresentation.text, null, {
            // Back to front: every replacement's offsets are stated against the
            // original text, so applying later ones first keeps them valid.
            for (replacement in result.replacements.asReversed()) {
                document.replaceString(replacement.start, replacement.end, replacement.text)
            }
            caret.moveToOffset(result.selectionEnd)
            caret.setSelection(result.selectionStart, result.selectionEnd)
        })
    }
}

class GlyphStrongAction : GlyphMarkupAction() {
    override fun edit(text: CharSequence, start: Int, end: Int) = GlyphEdits.toggleStrong(text, start, end)
}

class GlyphEmAction : GlyphMarkupAction() {
    override fun edit(text: CharSequence, start: Int, end: Int) = GlyphEdits.toggleEm(text, start, end)
}

class GlyphSuperscriptAction : GlyphMarkupAction() {
    override fun edit(text: CharSequence, start: Int, end: Int) = GlyphEdits.toggleSuperscript(text, start, end)
}

class GlyphSubscriptAction : GlyphMarkupAction() {
    override fun edit(text: CharSequence, start: Int, end: Int) = GlyphEdits.toggleSubscript(text, start, end)
}
