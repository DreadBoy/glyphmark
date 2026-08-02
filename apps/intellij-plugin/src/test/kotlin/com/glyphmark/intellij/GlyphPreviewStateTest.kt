package com.glyphmark.intellij

import org.jdom.Element
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The preview's settings are persisted as hand-written XML, which makes this
 * the most breakable part of the toolbar — a typo in an attribute name loses
 * the reader's zoom silently.
 */
class GlyphPreviewStateTest {

    private fun roundTrip(state: GlyphPreviewState): GlyphPreviewState {
        val element = Element("preview")
        GlyphPreviewState.write(state, element)
        return GlyphPreviewState.read(element)
    }

    @Test
    fun `survives a round trip`() {
        val state = GlyphPreviewState(zoomPercent = 150, fitWidth = true, scrollSync = false)
        assertEquals(state, roundTrip(state))
    }

    @Test
    fun `round trips the defaults`() {
        assertEquals(GlyphPreviewState(), roundTrip(GlyphPreviewState()))
    }

    /** An empty element is what a workspace file written before this existed looks like. */
    @Test
    fun `falls back to defaults when nothing was written`() {
        assertEquals(GlyphPreviewState(), GlyphPreviewState.read(Element("preview")))
    }

    /** Each field falls back on its own, so one bad value costs one setting. */
    @Test
    fun `falls back per field on garbage`() {
        val element = Element("preview").apply {
            setAttribute("zoom", "banana")
            setAttribute("fit_width", "yes")
            setAttribute("scroll_sync", "false")
        }
        val state = GlyphPreviewState.read(element)
        assertEquals(GlyphZoom.DEFAULT, state.zoomPercent)
        assertEquals(false, state.fitWidth)
        assertEquals(false, state.scrollSync)
    }

    @Test
    fun `clamps a zoom level from outside the stop range`() {
        val element = Element("preview").apply { setAttribute("zoom", "100000") }
        assertEquals(GlyphZoom.MAX, GlyphPreviewState.read(element).zoomPercent)
    }
}
