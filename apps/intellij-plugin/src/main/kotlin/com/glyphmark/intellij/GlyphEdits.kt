package com.glyphmark.intellij

/** One contiguous text replacement. */
data class GlyphReplacement(val start: Int, val end: Int, val text: String)

/**
 * What an editing action does to a document: non-overlapping [replacements] in
 * ascending order, and where the selection should land once they're applied.
 */
data class GlyphEdit(
    val replacements: List<GlyphReplacement>,
    val selectionStart: Int,
    val selectionEnd: Int,
)

/**
 * The text transformations behind the editor's emphasis actions.
 *
 * Pure functions over the document text so they can be unit tested without an
 * IDE fixture — [GlyphMarkupAction] does nothing but read the caret, call one of
 * these, and apply the result. The syntax mirrors
 * `libs/core/src/parser/inline.ts`: emphasis is symmetric, single-line and
 * non-nesting.
 */
object GlyphEdits {

    /** `*` for em, `**` for strong, `***` for both — there is no deeper run. */
    private const val MAX_STAR_RUN = 3

    /** Both spellings of emphasis, so toggling off recognises `_text_` too. */
    private const val STAR_CHARS = "*_"

    /**
     * A bullet and its text. The marker must be followed by a single space, not
     * any whitespace: `lexer.ts` tests `trimmed.startsWith('* ')`, so `*\tfoo`
     * is prose to the parser and continuing it as a list would teach a syntax
     * the renderer doesn't honour. Requiring the space is also what separates
     * `- item` from a lone `-`, which the lexer reads as an hr.
     *
     * The leading indent is captured so continuation can reproduce it. That is
     * an editor affordance rather than grammar — the lexer works off the trimmed
     * line, so indentation carries no meaning and lists don't nest.
     */
    private val LIST_ITEM = Regex("""^([ \t]*)([*-]) (.*)$""")

    // -- lists ---------------------------------------------------------------

    /**
     * The bullet that continues the list [line] belongs to, or null if it isn't
     * a list item. Preserves the indent and the marker character.
     *
     * An empty body still continues, because by the time this is asked the line
     * has already been split: pressing Enter in `* |foo` leaves `* ` behind, and
     * the new line is still part of the list. Pressing Enter on a bullet that
     * was *already* empty never reaches here — [emptyListItemEnd] catches it
     * first and ends the list instead.
     */
    fun listContinuation(line: CharSequence): String? {
        val match = LIST_ITEM.matchEntire(line) ?: return null
        return match.groupValues[1] + match.groupValues[2] + " "
    }

    /**
     * For a bullet with nothing after it, the column just past the marker;
     * null for anything else. Enter at or after that column ends the list
     * rather than adding another empty bullet — before it, the caret is inside
     * the marker and Enter should just split the line as usual.
     */
    fun emptyListItemEnd(line: CharSequence): Int? {
        val match = LIST_ITEM.matchEntire(line) ?: return null
        if (!match.groupValues[3].isBlank()) return null
        return match.groupValues[1].length + match.groupValues[2].length + 1
    }

    // -- emphasis ------------------------------------------------------------

    fun toggleStrong(text: CharSequence, start: Int, end: Int): GlyphEdit? =
        stars(text, start, end, strong = true)

    fun toggleEm(text: CharSequence, start: Int, end: Int): GlyphEdit? =
        stars(text, start, end, strong = false)

    fun toggleSuperscript(text: CharSequence, start: Int, end: Int): GlyphEdit? =
        emphasis(text, start, end, "^", '^', maxRun = 1, carries = { it == 1 }) { _, on -> if (on) 1 else 0 }

    fun toggleSubscript(text: CharSequence, start: Int, end: Int): GlyphEdit? =
        emphasis(text, start, end, "~", '~', maxRun = 1, carries = { it == 1 }) { _, on -> if (on) 1 else 0 }

    /**
     * Star emphasis, where the run length *is* the styling: 1 is em, 2 is
     * strong, 3 is strong-wrapping-em. Because the three states share one
     * delimiter, toggling one marker rewrites the run rather than nesting
     * inside it — `*a*` bolded becomes `***a***`, not a bold pair around the
     * existing italic one. That also makes the two toggles compose, so
     * strong-em needs no action of its own.
     */
    private fun stars(text: CharSequence, start: Int, end: Int, strong: Boolean): GlyphEdit? =
        emphasis(
            text,
            start,
            end,
            STAR_CHARS,
            '*',
            MAX_STAR_RUN,
            carries = { run -> if (strong) run == 2 || run == 3 else run == 1 || run == 3 },
        ) { run, on ->
            // Whichever marker isn't being toggled keeps whatever the run said.
            val hasStrong = if (strong) on else run == 2 || run == 3
            val hasEm = if (strong) run == 1 || run == 3 else on
            (if (hasStrong) 2 else 0) + (if (hasEm) 1 else 0)
        }

    /**
     * @param chars delimiter characters recognised when reading existing markup
     * @param emit  delimiter written when adding markup
     * @param carries whether a run of that length already has the marker
     * @param next  run length for (current run, whether the marker is going on)
     */
    private fun emphasis(
        text: CharSequence,
        start: Int,
        end: Int,
        chars: String,
        emit: Char,
        maxRun: Int,
        carries: (Int) -> Boolean,
        next: (Int, Boolean) -> Int,
    ): GlyphEdit? {
        val spans = emphasisSpans(text, start, end)
        if (spans.isEmpty()) return null

        val marked = spans.map { (from, to) -> delimiters(text, from, to, chars, maxRun) }
        // Emphasis has no escape and no nesting, so any edit that would put a
        // delimiter next to another one, or wrap text that already contains
        // one, produces a run the parser reads as something else entirely.
        // There is no correct output in those cases — only a wrong one — so the
        // action declines rather than quietly corrupting the document.
        if (marked.any { it.abuts(text, chars) || it.body(text).contains(emit) }) return null

        // One mixed selection shouldn't half-bold and half-unbold: adding wins
        // unless every span already carries the marker.
        val on = !marked.all { carries(it.run) }

        val segments = marked.map { mark ->
            val run = next(mark.run, on)
            val delimiter = (if (mark.run > 0) mark.char else emit).toString().repeat(run)
            val body = mark.body(text)
            Segment(
                GlyphReplacement(mark.outerStart, mark.outerEnd, delimiter + body + delimiter),
                innerOffset = run,
                innerLength = body.length,
            )
        }
        return assemble(segments)
    }

    /**
     * What the toggle should wrap: one span per line the selection touches,
     * trimmed of surrounding whitespace. Split per line because glyph emphasis
     * never spans a newline, yet a source paragraph routinely does — the lexer
     * joins its lines back together.
     */
    private fun emphasisSpans(text: CharSequence, start: Int, end: Int): List<Pair<Int, Int>> {
        if (start == end) return listOf(wordAt(text, start))

        val spans = mutableListOf<Pair<Int, Int>>()
        var lineStart = lineStartOf(text, start)
        while (lineStart < end) {
            val lineEnd = lineEndOf(text, lineStart)
            var from = maxOf(lineStart, start)
            var to = minOf(lineEnd, end)
            while (from < to && text[from].isWhitespace()) from++
            while (to > from && text[to - 1].isWhitespace()) to--
            if (from < to) spans += from to to
            lineStart = lineEnd + 1
        }
        return spans
    }

    /** The word under the caret, or the empty span at the caret if there is none. */
    private fun wordAt(text: CharSequence, offset: Int): Pair<Int, Int> {
        var from = offset
        var to = offset
        while (from > 0 && text[from - 1].isWordChar()) from--
        while (to < text.length && text[to].isWordChar()) to++
        return from to to
    }

    private fun Char.isWordChar(): Boolean = isLetterOrDigit() || this == '\''

    private class Mark(
        val outerStart: Int,
        val innerStart: Int,
        val innerEnd: Int,
        val outerEnd: Int,
        val char: Char,
        val run: Int,
    ) {
        fun body(text: CharSequence): String = text.subSequence(innerStart, innerEnd).toString()

        /**
         * Whether a delimiter sits immediately outside the region being
         * rewritten. Writing next to one merges the two into a longer run —
         * `*|hello| world*` bolded would become `***hello** world*`, which
         * reparses as strong `*hello` followed by literal text.
         */
        fun abuts(text: CharSequence, chars: String): Boolean =
            (outerStart > 0 && text[outerStart - 1] in chars) ||
                (outerEnd < text.length && text[outerEnd] in chars)
    }

    /**
     * Finds the delimiter run already wrapping `[from, to)`, whether the
     * selection sits inside it (`**|text|**`) or swallows it (`|**text**|`), so
     * that pressing bold twice is a no-op either way.
     */
    private fun delimiters(text: CharSequence, from: Int, to: Int, chars: String, maxRun: Int): Mark {
        val inside = runAt(text, from, +1, chars)
        if (inside != null) {
            val closing = runAt(text, to, -1, chars)
            if (closing != null && closing.first == inside.first) {
                val run = minOf(inside.second, closing.second, maxRun)
                // Anything past `maxRun` isn't markup we understand; leave it as
                // literal text inside the span rather than silently eating it.
                val outerStart = from + (inside.second - run)
                val outerEnd = to - (closing.second - run)
                if (run > 0 && outerStart + run < outerEnd - run) {
                    return Mark(outerStart, outerStart + run, outerEnd - run, outerEnd, inside.first, run)
                }
            }
        }

        val before = runAt(text, from, -1, chars)
        val after = runAt(text, to, +1, chars)
        if (before != null && after != null && before.first == after.first) {
            val run = minOf(before.second, after.second, maxRun)
            return Mark(from - run, from, to, to + run, before.first, run)
        }
        return Mark(from, from, to, to, ' ', 0)
    }

    /**
     * The run of one [chars] character starting at [offset] and going in
     * [direction] (`-1` scans the characters *before* the offset), or null if
     * there is none.
     */
    private fun runAt(text: CharSequence, offset: Int, direction: Int, chars: String): Pair<Char, Int>? {
        val first = if (direction > 0) offset else offset - 1
        if (first !in text.indices) return null
        val char = text[first]
        if (char !in chars) return null
        var length = 0
        var i = first
        while (i in text.indices && text[i] == char) {
            length++
            i += direction
        }
        return char to length
    }

    // -- shared plumbing -----------------------------------------------------

    private class Segment(val replacement: GlyphReplacement, val innerOffset: Int, val innerLength: Int)

    /** Spans the selection across every wrapped body, accounting for earlier edits. */
    private fun assemble(segments: List<Segment>): GlyphEdit {
        var delta = 0
        var selectionStart = -1
        var selectionEnd = -1
        for (segment in segments) {
            val inner = segment.replacement.start + delta + segment.innerOffset
            if (selectionStart < 0) selectionStart = inner
            selectionEnd = inner + segment.innerLength
            delta += segment.replacement.text.length - (segment.replacement.end - segment.replacement.start)
        }
        return GlyphEdit(segments.map { it.replacement }, selectionStart, selectionEnd)
    }

    private fun lineStartOf(text: CharSequence, offset: Int): Int {
        var i = offset.coerceIn(0, text.length)
        while (i > 0 && text[i - 1] != '\n') i--
        return i
    }

    private fun lineEndOf(text: CharSequence, offset: Int): Int {
        var i = offset.coerceIn(0, text.length)
        while (i < text.length && text[i] != '\n') i++
        return i
    }
}
