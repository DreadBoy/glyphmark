package com.glyphmark.intellij

import com.intellij.openapi.Disposable
import com.intellij.openapi.editor.Editor
import com.intellij.util.Alarm
import java.awt.Point

/**
 * How long editor scrolling is allowed to accumulate before the preview is
 * told about it. Every push crosses the JCEF process boundary, so they are
 * worth coalescing — but the preview eases towards whatever it is told, and a
 * steady stream of small updates is exactly what makes that easing track the
 * editor rather than lurch after it. IntelliJ's own Markdown preview throttles
 * its scroll bridge at the same 20ms.
 */
private const val EDITOR_SCROLL_COALESCE_MS = 20

/**
 * Keeps the preview on whatever part of the document the source editor is
 * showing.
 *
 * **One way, deliberately.** The editor drives the preview and never the other
 * way round. Scrolling the preview is the reader looking somewhere on their own
 * account — checking a table two pages down while the caret stays where they
 * left it — and dragging the editor along behind them would move the source out
 * from under them for no reason they asked for. It also means there is no
 * feedback loop here to break: the preview reports nothing back, so nothing can
 * echo.
 *
 * Lives here rather than in [GlyphPreviewFileEditor] because it needs the
 * source [Editor], and [GlyphEditorWithPreview] is the only object that owns
 * both halves of the split. Keeping it out of the preview leaves that class a
 * pure function of the file.
 */
class GlyphScrollSync(
    private val editor: Editor,
    private val preview: GlyphPreviewFileEditor,
    parentDisposable: Disposable,
) {

    /**
     * Last line the preview actually received; a repeat would be a wasted trip
     * across the bridge. Only recorded once the push has landed — recording an
     * undelivered one would make the dedup below suppress every retry, leaving
     * a file that was opened already scrolled stuck at the top of the preview
     * until the reader happened to move to a different line.
     */
    private var lastSentLine: Int? = null

    private val alarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, parentDisposable)

    init {
        editor.scrollingModel.addVisibleAreaListener({ event ->
            // Width changes and caret moves raise this too; only vertical
            // movement means the reader went somewhere else.
            if (event.oldRectangle?.y == event.newRectangle.y) return@addVisibleAreaListener
            alarm.cancelAllRequests()
            alarm.addRequest(::pushEditorPosition, EDITOR_SCROLL_COALESCE_MS)
        }, parentDisposable)
    }

    private fun pushEditorPosition() {
        if (editor.isDisposed || !preview.isShowing()) return

        val line = topVisibleLine()
        if (line == lastSentLine) return
        if (preview.scrollToLine(line)) lastSentLine = line
    }

    /** 1-based source line at the top edge of the editor's viewport. */
    private fun topVisibleLine(): Int {
        val visibleArea = editor.scrollingModel.visibleArea
        return editor.xyToLogicalPosition(Point(0, visibleArea.y)).line + 1
    }
}
