package com.glyphmark.intellij

import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import org.jdom.Element

/**
 * What the preview toolbar remembers about a file: how far it is zoomed in,
 * whether it is tracking the frame width, and whether it follows the source
 * editor's scrolling.
 *
 * These are per-file rather than global on purpose. Zoom is a property of the
 * document being read — a one-page reference card and a two-hundred-page book
 * want different ones — and carrying a global level between them would be a
 * setting the reader has to keep undoing.
 */
data class GlyphPreviewState(
    val zoomPercent: Int = GlyphZoom.DEFAULT,
    val fitWidth: Boolean = false,
    val scrollSync: Boolean = true,
) : FileEditorState {

    override fun canBeMergedWith(otherState: FileEditorState, level: FileEditorStateLevel): Boolean =
        otherState is GlyphPreviewState

    companion object {
        private const val ZOOM = "zoom"
        private const val FIT_WIDTH = "fit_width"
        private const val SCROLL_SYNC = "scroll_sync"

        /**
         * Every field falls back to its default independently, so a hand-edited
         * or half-written `workspace.xml` costs the reader one setting rather
         * than dropping them back to a default preview wholesale.
         */
        fun read(element: Element): GlyphPreviewState {
            val default = GlyphPreviewState()
            return GlyphPreviewState(
                zoomPercent = element.getAttributeValue(ZOOM)
                    ?.toIntOrNull()
                    ?.let(GlyphZoom::clamp)
                    ?: default.zoomPercent,
                fitWidth = element.getAttributeValue(FIT_WIDTH)?.toBooleanStrictOrNull() ?: default.fitWidth,
                scrollSync = element.getAttributeValue(SCROLL_SYNC)?.toBooleanStrictOrNull() ?: default.scrollSync,
            )
        }

        fun write(state: GlyphPreviewState, element: Element) {
            element.setAttribute(ZOOM, state.zoomPercent.toString())
            element.setAttribute(FIT_WIDTH, state.fitWidth.toString())
            element.setAttribute(SCROLL_SYNC, state.scrollSync.toString())
        }
    }
}
