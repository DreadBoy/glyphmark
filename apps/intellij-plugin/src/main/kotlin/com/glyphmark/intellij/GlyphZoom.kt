package com.glyphmark.intellij

/**
 * The preview's zoom stops, and the arithmetic for stepping between them.
 *
 * **Integer percent is the canonical unit everywhere** — here, in
 * [GlyphPreviewState], in the status payload and in the JavaScript bridge. The
 * page divides by 100 exactly once, at the point it writes the CSS. Carrying a
 * `Double` factor on the Kotlin side and an int percent in the persisted state
 * would round-trip 0.67 → 67 → 0.67, and that drift shows up as a stop that
 * will not step.
 *
 * Kept platform-free and in its own object for the same reason [GlyphEdits] and
 * [GlyphOutline] are: it is the part worth unit testing without an IDE fixture.
 */
object GlyphZoom {

    /**
     * Deliberately not a fixed ratio. The stops crowd around 100% because that
     * is where readers actually work — a document at 90% versus 110% is a
     * meaningful choice, while the difference between 250% and 300% is not.
     */
    val STOPS = listOf(25, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 300)

    val MIN = STOPS.first()
    val MAX = STOPS.last()
    const val DEFAULT = 100

    /**
     * The next stop strictly above [percent], or [MAX] at the top.
     *
     * "Strictly above" rather than "index + 1" so that stepping out of a
     * fit-to-width factor works: fit lands on arbitrary numbers like 83, and
     * the reader expects the next click to go to 90, not to whichever stop
     * happens to share an index with it.
     */
    fun zoomIn(percent: Int): Int = STOPS.firstOrNull { it > percent } ?: MAX

    /** The next stop strictly below [percent], or [MIN] at the bottom. */
    fun zoomOut(percent: Int): Int = STOPS.lastOrNull { it < percent } ?: MIN

    fun clamp(percent: Int): Int = percent.coerceIn(MIN, MAX)

    fun format(percent: Int): String = "$percent%"
}
