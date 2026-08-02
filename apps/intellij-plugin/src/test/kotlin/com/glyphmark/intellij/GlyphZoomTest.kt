package com.glyphmark.intellij

import kotlin.test.Test
import kotlin.test.assertEquals

class GlyphZoomTest {

    @Test
    fun `steps between adjacent stops`() {
        assertEquals(110, GlyphZoom.zoomIn(100))
        assertEquals(90, GlyphZoom.zoomOut(100))
    }

    /**
     * The case that matters: fit-to-width produces arbitrary percentages, and
     * the next click has to land on the neighbouring stop rather than on
     * whichever one shares an index with it.
     */
    @Test
    fun `steps out of a value between stops`() {
        assertEquals(90, GlyphZoom.zoomIn(83))
        assertEquals(75, GlyphZoom.zoomOut(83))
    }

    @Test
    fun `clamps at the ends instead of stepping past them`() {
        assertEquals(GlyphZoom.MAX, GlyphZoom.zoomIn(GlyphZoom.MAX))
        assertEquals(GlyphZoom.MIN, GlyphZoom.zoomOut(GlyphZoom.MIN))
        assertEquals(GlyphZoom.MAX, GlyphZoom.zoomIn(1000))
        assertEquals(GlyphZoom.MIN, GlyphZoom.zoomOut(1))
    }

    /** A fit factor outside the stop range still steps back into it. */
    @Test
    fun `steps back into range from outside it`() {
        assertEquals(GlyphZoom.MIN, GlyphZoom.zoomIn(10))
        assertEquals(GlyphZoom.MAX, GlyphZoom.zoomOut(1000))
    }

    @Test
    fun `clamps to the stop range`() {
        assertEquals(GlyphZoom.MIN, GlyphZoom.clamp(1))
        assertEquals(GlyphZoom.MAX, GlyphZoom.clamp(10_000))
        assertEquals(83, GlyphZoom.clamp(83))
    }

    @Test
    fun `formats as a percentage`() {
        assertEquals("100%", GlyphZoom.format(100))
    }

    @Test
    fun `stops are sorted and unique`() {
        assertEquals(GlyphZoom.STOPS.sorted().distinct(), GlyphZoom.STOPS)
    }
}
