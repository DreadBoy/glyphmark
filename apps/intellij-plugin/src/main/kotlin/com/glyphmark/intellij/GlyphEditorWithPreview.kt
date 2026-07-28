package com.glyphmark.intellij

import com.intellij.ide.structureView.StructureViewBuilder
import com.intellij.ide.structureView.StructureViewModel
import com.intellij.ide.structureView.TreeBasedStructureViewBuilder
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiManager

/**
 * The source/preview split editor for `.glyph` files, plus the Structure view.
 *
 * The Structure view hangs off the editor rather than an extension point on
 * purpose: `.glyph` files are backed by [com.intellij.openapi.fileTypes.PlainTextLanguage],
 * and a `lang.psiStructureViewFactory` registered for plain text would be asked
 * about every plain-text file in the IDE.
 */
class GlyphEditorWithPreview(
    editor: TextEditor,
    preview: FileEditor,
    private val myProject: Project,
    private val myFile: VirtualFile,
) : TextEditorWithPreview(editor, preview, "GlyphEditorWithPreview", Layout.SHOW_EDITOR_AND_PREVIEW) {

    override fun getStructureViewBuilder(): StructureViewBuilder? {
        val psiFile = PsiManager.getInstance(myProject).findFile(myFile) ?: return null
        return object : TreeBasedStructureViewBuilder() {
            override fun createStructureViewModel(editor: Editor?): StructureViewModel =
                GlyphStructureViewModel(psiFile, editor)

            override fun isRootNodeShown(): Boolean = false
        }
    }
}
