package com.glyphmark.intellij

import com.intellij.icons.AllIcons
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.structureView.StructureViewModel
import com.intellij.ide.structureView.StructureViewTreeElement
import com.intellij.ide.structureView.TextEditorBasedStructureViewModel
import com.intellij.ide.util.treeView.smartTree.Sorter
import com.intellij.ide.util.treeView.smartTree.TreeElement
import com.intellij.navigation.ItemPresentation
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.psi.PsiFile
import javax.swing.Icon

/**
 * Structure view over a `.glyph` file's headings and blocks.
 *
 * Backed by [GlyphOutline] rather than PSI — `.glyph` files are plain text to
 * the IDE, so there's no tree to walk. Extending
 * [TextEditorBasedStructureViewModel] is still worth it: it wires up the caret
 * listener that keeps the tree in sync with the editor.
 */
class GlyphStructureViewModel(psiFile: PsiFile, editor: Editor?) :
    TextEditorBasedStructureViewModel(editor, psiFile),
    StructureViewModel.ElementInfoProvider {

    private val outline = OutlineCache(psiFile)
    private val root = GlyphFileElement(psiFile, outline)

    override fun getRoot(): StructureViewTreeElement = root

    override fun getSorters(): Array<Sorter> = arrayOf(Sorter.ALPHA_SORTER)

    /**
     * Without an [StructureViewModel.ElementInfoProvider] the tree assumes every
     * node might have children and draws an expand arrow on all of them.
     */
    override fun isAlwaysShowsPlus(element: StructureViewTreeElement): Boolean = false

    override fun isAlwaysLeaf(element: StructureViewTreeElement): Boolean =
        (element.value as? GlyphOutlineNode)?.children?.isEmpty() == true

    /** Selects the innermost entry containing the caret. */
    override fun getCurrentEditorElement(): Any? {
        val offset = editor?.caretModel?.offset ?: return null
        var match: GlyphOutlineNode? = null
        var candidates = outline.root().children
        while (true) {
            val hit = candidates.lastOrNull { offset >= it.startOffset && offset < it.endOffset } ?: break
            match = hit
            candidates = hit.children
        }
        return match
    }

    /**
     * Re-scans only when the document actually changed. The Structure view asks
     * for children and for the caret's element separately, and rebuilds on every
     * keystroke.
     */
    private class OutlineCache(private val psiFile: PsiFile) {
        private var stamp: Long = Long.MIN_VALUE
        private var cached: GlyphOutlineNode? = null

        fun root(): GlyphOutlineNode {
            val document = psiFile.viewProvider.document
            val current = document?.modificationStamp ?: -1
            cached?.let { if (stamp == current) return it }
            val parsed = GlyphOutline.parse(document?.charsSequence ?: psiFile.text)
            stamp = current
            cached = parsed
            return parsed
        }
    }

    private class GlyphFileElement(
        private val psiFile: PsiFile,
        private val outline: OutlineCache,
    ) : StructureViewTreeElement {

        override fun getValue(): Any = psiFile

        override fun getPresentation(): ItemPresentation =
            PresentationData(psiFile.name, null, GlyphFileType.INSTANCE.icon, null)

        override fun getChildren(): Array<TreeElement> = childrenOf(psiFile, outline.root())

        override fun canNavigate(): Boolean = psiFile.canNavigate()

        override fun canNavigateToSource(): Boolean = psiFile.canNavigateToSource()

        override fun navigate(requestFocus: Boolean) = psiFile.navigate(requestFocus)
    }

    private class GlyphNodeElement(
        private val psiFile: PsiFile,
        private val node: GlyphOutlineNode,
    ) : StructureViewTreeElement {

        override fun getValue(): Any = node

        override fun getPresentation(): ItemPresentation =
            PresentationData(node.title, locationOf(node), iconOf(node), null)

        override fun getChildren(): Array<TreeElement> = childrenOf(psiFile, node)

        override fun canNavigate(): Boolean = psiFile.virtualFile != null

        override fun canNavigateToSource(): Boolean = canNavigate()

        override fun navigate(requestFocus: Boolean) {
            val file = psiFile.virtualFile ?: return
            OpenFileDescriptor(psiFile.project, file, node.startOffset).navigate(requestFocus)
        }
    }

    private companion object {

        fun childrenOf(psiFile: PsiFile, node: GlyphOutlineNode): Array<TreeElement> =
            node.children.map { GlyphNodeElement(psiFile, it) }.toTypedArray()

        /** Block keyword and subtitle, as the grey trailing text. */
        fun locationOf(node: GlyphOutlineNode): String? {
            val parts = listOfNotNull(
                node.blockType?.takeIf { it != node.title },
                node.subtitle,
            )
            return parts.joinToString(" · ").ifEmpty { null }
        }

        fun iconOf(node: GlyphOutlineNode): Icon = when (node.kind) {
            GlyphOutlineKind.BLOCK -> AllIcons.Nodes.Class
            GlyphOutlineKind.REFERENCE -> AllIcons.Nodes.Template
            else -> AllIcons.Nodes.Tag
        }
    }
}
