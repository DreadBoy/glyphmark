package com.glyphmark.intellij

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.TextEditor
import com.intellij.openapi.fileEditor.TextEditorWithPreview
import com.intellij.openapi.fileEditor.impl.text.TextEditorProvider
import com.intellij.openapi.fileEditor.impl.text.TextEditorState
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import org.jdom.Element

/**
 * Opens `.glyph` files in a source/preview split, the same shape the Markdown
 * plugin uses — [GlyphEditorWithPreview] supplies the editor-only / split /
 * preview-only toolbar for free.
 */
class GlyphEditorWithPreviewProvider : FileEditorProvider, DumbAware {

    override fun accept(project: Project, file: VirtualFile): Boolean =
        file.fileType == GlyphFileType.INSTANCE

    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        val textEditor = TextEditorProvider.getInstance().createEditor(project, file) as TextEditor
        return GlyphEditorWithPreview(textEditor, GlyphPreviewFileEditor(file), project, file)
    }

    override fun getEditorTypeId(): String = "glyphmark-editor-with-preview"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    /**
     * Persists the split editor's state to `workspace.xml`, and with it the
     * preview toolbar's settings.
     *
     * This has to be written out by hand. [TextEditorWithPreview] does build a
     * composite state and hand each half its own back, but that only survives
     * within a session — `FileEditorProvider.readState`/`writeState` are
     * defaulted no-ops, so without these overrides nothing reaches disk at all.
     * That is also why the split layout was forgotten between sessions until
     * now.
     *
     * (Rebuilding this on `TextEditorWithPreviewProvider` would get it for
     * free, but that base class is an `AsyncFileEditorProvider` with a `final`
     * suspend `createFileEditor` — a much larger change than a toolbar
     * warrants.)
     */
    override fun readState(sourceElement: Element, project: Project, file: VirtualFile): FileEditorState {
        // Null, not `FileEditorState.INSTANCE`, when there is nothing to read.
        //
        // A workspace file written before this override existed has an empty
        // element here — the platform wrote one even while `writeState` was a
        // defaulted no-op — so this branch is the upgrade path, not a corner.
        // `INSTANCE` would travel back out through `writeState` into
        // `TextEditorProvider.writeState`, which casts to `TextEditorState`
        // without checking and throws. `MyFileEditorState` takes nulls, and
        // `TextEditorWithPreview.setState` skips a null half.
        val editorState = sourceElement.getChild(TEXT_EDITOR)
            ?.let { TextEditorProvider.getInstance().readState(it, project, file) }

        val previewState = sourceElement.getChild(PREVIEW)
            ?.let { GlyphPreviewState.read(it) }
            ?: GlyphPreviewState()

        // An unknown or absent layout falls back to the default rather than
        // failing the whole read: a stale workspace file should cost the reader
        // a layout, not their zoom level too.
        //
        // `Layout.id`, never `Layout.name` — the enum declares its own `name`
        // property holding a human-readable display name, so persisting that
        // would write UI text into `workspace.xml`.
        val layout = TextEditorWithPreview.Layout.fromId(
            sourceElement.getAttributeValue(SPLIT_LAYOUT) ?: "",
            TextEditorWithPreview.Layout.SHOW_EDITOR_AND_PREVIEW,
        )

        val vertical = sourceElement.getAttributeValue(IS_VERTICAL_SPLIT)?.toBooleanStrictOrNull() ?: false

        return TextEditorWithPreview.MyFileEditorState(layout, editorState, previewState, vertical)
    }

    override fun writeState(state: FileEditorState, project: Project, targetElement: Element) {
        if (state !is TextEditorWithPreview.MyFileEditorState) return

        state.splitLayout?.let { targetElement.setAttribute(SPLIT_LAYOUT, it.id) }
        targetElement.setAttribute(IS_VERTICAL_SPLIT, state.isVerticalSplit.toString())

        // Type-checked rather than assumed: `TextEditorProvider.writeState`
        // casts to `TextEditorState` unguarded, so anything else reaching it —
        // a `FileEditorState.INSTANCE` left over from an older workspace file,
        // say — would take the IDE down on project close.
        (state.firstState as? TextEditorState)?.let { editorState ->
            val child = Element(TEXT_EDITOR)
            TextEditorProvider.getInstance().writeState(editorState, project, child)
            targetElement.addContent(child)
        }

        (state.secondState as? GlyphPreviewState)?.let { previewState ->
            val child = Element(PREVIEW)
            GlyphPreviewState.write(previewState, child)
            targetElement.addContent(child)
        }
    }

    private companion object {
        const val TEXT_EDITOR = "text_editor"
        const val PREVIEW = "preview"
        const val SPLIT_LAYOUT = "split_layout"
        const val IS_VERTICAL_SPLIT = "is_vertical_split"
    }
}
