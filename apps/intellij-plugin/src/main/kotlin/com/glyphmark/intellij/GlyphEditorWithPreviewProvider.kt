package com.glyphmark.intellij

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.fileEditor.impl.text.TextEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile

/**
 * Opens `.glyph` files in a source/preview split, the same shape the Markdown
 * plugin uses — [TextEditorWithPreview] supplies the editor-only / split /
 * preview-only toolbar for free.
 */
class GlyphEditorWithPreviewProvider : FileEditorProvider, DumbAware {

    override fun accept(project: Project, file: VirtualFile): Boolean =
        file.fileType == GlyphFileType.INSTANCE

    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        val textEditor = TextEditorProvider.getInstance().createEditor(project, file) as TextEditor
        return TextEditorWithPreview(
            textEditor,
            GlyphPreviewFileEditor(file),
            "GlyphEditorWithPreview",
            TextEditorWithPreview.Layout.SHOW_EDITOR_AND_PREVIEW,
        )
    }

    override fun getEditorTypeId(): String = "glyphmark-editor-with-preview"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}
