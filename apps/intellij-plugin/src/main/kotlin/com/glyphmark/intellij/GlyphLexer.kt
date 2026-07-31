package com.glyphmark.intellij

/**
 * A range within a token's own line: `[start, end)`, counted from column 0 of
 * that line including any indentation.
 *
 * Mirrors `Part` in `libs/core/src/parser/lexer.ts`. Recognition reports *where*
 * a part of the line is rather than a cleaned-up copy of it, which is what lets
 * the highlighter colour a heading's `#` differently from its text.
 */
data class Part(val start: Int, val end: Int)

/** What a line was recognized as. Mirrors the `kind` discriminator in the TS lexer. */
enum class GlyphTokenKind {
    BLOCK_OPEN,
    BLOCK_CLOSE,
    BLOCK_INLINE,
    REF_OPEN,
    REF_CLOSE,
    HIDDEN_DELIMITER,
    PAGE_BREAK,
    COLUMN_BREAK,
    FULL_WIDTH_TOGGLE,
    HR,
    HEADING,
    CENTERED_TEXT,
    PIPE_LINE,
    FOOTNOTE_LINE,
    LIST_ITEM,
    TRAIT_LINE,
    REFERENCE,
    TEXT,
    BLANK;

    /** The name used in the shared golden fixtures, e.g. `block-open`. */
    val wireName: String get() = name.lowercase().replace('_', '-')
}

/** What an inline run of markup is, before anything decides what it means. */
enum class InlineKind {
    STRONG,
    EM,
    STRONG_EM,
    SUP,
    SUB,
    ACTION;

    /** The name used in the shared golden fixtures, e.g. `strong-em`. */
    val wireName: String get() = name.lowercase().replace('_', '-')
}

/**
 * One run of inline markup, located within the line it was found in.
 *
 * [start]/[end] cover the whole run including its delimiters — what the editor
 * needs so it never colours halfway through one. [contentStart]/[contentEnd]
 * cover just the enclosed text. For an action symbol the two coincide: the
 * symbol is the content.
 */
data class InlineSpan(
    val kind: InlineKind,
    val start: Int,
    val end: Int,
    val contentStart: Int,
    val contentEnd: Int,
)

/**
 * One physical line, classified.
 *
 * `startOffset`/`endOffset` are absolute in the document and cover exactly the
 * line's characters, excluding its newline. Every payload is a [Part] relative
 * to [raw], so nothing is trimmed and nothing is copied.
 */
data class GlyphToken(
    val kind: GlyphTokenKind,
    /** 1-based physical line. */
    val line: Int,
    val startOffset: Int,
    val endOffset: Int,
    val raw: String,
    /** How many `#` a heading has; 0 for everything else. */
    val level: Int = 0,
    val keyword: Part? = null,
    val key: Part? = null,
    val marker: Part? = null,
    val content: Part? = null,
    val inner: Part? = null,
    /**
     * Inline markup found in whatever part of the line carries prose, in the
     * line's own coordinates. Empty for lines that carry none.
     */
    val inline: List<InlineSpan> = emptyList(),
) {
    fun text(part: Part): String = raw.substring(part.start, part.end)
}

/**
 * Recognizes `.glyph` lines, one token per line.
 *
 * A port of `tokenize`/`recognize` in `libs/core/src/parser/lexer.ts`, kept
 * deliberately literal so the two stay comparable. The shared fixtures under
 * `libs/core/test/golden/<fixture>/golden.tokens.json` are asserted by both sides, so
 * either implementation drifting fails a build.
 *
 * Line recognition only: it does not pair delimiters, decide whether a run of
 * lines is a table, trim anything, or reject constructs that are invalid where
 * they appear.
 */
object GlyphLexer {

    /**
     * The characters JavaScript treats as whitespace — what `String.trim()`
     * strips and what regex `\s` matches.
     *
     * Spelled out rather than inherited from the host, because the two hosts
     * disagree. Kotlin's `trim()` uses `Char.isWhitespace`, which **excludes**
     * U+00A0, and Java's regex `\s` is `[ \t\n\x0B\f\r]` with no Unicode at
     * all. Left alone, that difference would silently shift every part offset on
     * a line indented with a non-breaking space — and `pdf2glyph` produces
     * exactly that kind of input, so it is a real case, not a hypothetical.
     *
     * Mirrors the ECMAScript `WhiteSpace` and `LineTerminator` productions.
     */
    private fun isGlyphWhitespace(c: Char): Boolean = when (c) {
        '\u0009', '\u000A', '\u000B', '\u000C', '\u000D',
        '\u0020', '\u00A0', '\u1680', '\u2028', '\u2029',
        '\u202F', '\u205F', '\u3000', '\uFEFF',
        -> true

        else -> c in '\u2000'..'\u200A'
    }

    // The same set as a regex character class, so the patterns below agree with
    // the trimming above.
    private const val WS = "[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A" +
        "\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]"

    private const val KEYWORD = "item|info|rule|sample|head|css|fonts"
    private val BLOCK_OPEN_RE = Regex("^($KEYWORD)$WS*\\($")
    private val BLOCK_INLINE_RE = Regex("^($KEYWORD)$WS*\\((.*)\\)$")
    private val REF_OPEN_RE = Regex("^(\\w+)$WS*\\{$")
    private val HEADING_RE = Regex("^(#+)$WS+(.+)$")
    private val CENTERED_RE = Regex("^\\^$WS+(.+)$")
    private val REFERENCE_RE = Regex("^\\{\\{(\\w+)}}$")
    private val FOOTNOTE_RE = Regex("^\\.$WS*\\[(\\*|\\d+)]$WS+(.+)$")

    private fun String.glyphTrim(): String {
        var start = 0
        var end = length
        while (start < end && isGlyphWhitespace(this[start])) start++
        while (end > start && isGlyphWhitespace(this[end - 1])) end--
        return substring(start, end)
    }

    private fun String.glyphIndent(): Int {
        var i = 0
        while (i < length && isGlyphWhitespace(this[i])) i++
        return i
    }

    /**
     * Tokenize a document into a flat stream, one token per physical line.
     *
     * Splits on `\n` only, exactly as the TS lexer does, so offsets agree
     * line for line.
     */
    fun tokenize(input: String): List<GlyphToken> {
        val lines = input.split("\n")
        val tokens = ArrayList<GlyphToken>(lines.size)
        var offset = 0
        for ((i, line) in lines.withIndex()) {
            val tok = recognize(line, i + 1, offset)
            tokens.add(tok.copy(inline = scanProse(tok)))
            offset += line.length + 1 // +1 for the '\n' that split() removed
        }
        return tokens
    }

    private fun recognize(line: String, lineNo: Int, startOffset: Int): GlyphToken {
        val end = startOffset + line.length
        fun token(
            kind: GlyphTokenKind,
            level: Int = 0,
            keyword: Part? = null,
            key: Part? = null,
            marker: Part? = null,
            content: Part? = null,
            inner: Part? = null,
        ) = GlyphToken(kind, lineNo, startOffset, end, line, level, keyword, key, marker, content, inner)

        val trimmed = line.glyphTrim()
        if (trimmed.isEmpty()) return token(GlyphTokenKind.BLANK)

        // Every pattern below is matched against the trimmed line, so part
        // offsets are shifted back by the indentation to land in the raw line.
        val indent = line.glyphIndent()
        fun at(s: Int, e: Int) = Part(indent + s, indent + e)
        // Patterns ending in `(.+)$` capture through the end of the trimmed
        // line, so the capture's length locates where it began.
        fun tail(capture: String) = at(trimmed.length - capture.length, trimmed.length)

        // Lone-marker lines require no leading whitespace.
        when (line) {
            "%" -> return token(GlyphTokenKind.HIDDEN_DELIMITER)
            "=" -> return token(GlyphTokenKind.PAGE_BREAK)
            "|" -> return token(GlyphTokenKind.COLUMN_BREAK)
            "/" -> return token(GlyphTokenKind.FULL_WIDTH_TOGGLE)
            "-" -> return token(GlyphTokenKind.HR)
            ")" -> return token(GlyphTokenKind.BLOCK_CLOSE)
            "}" -> return token(GlyphTokenKind.REF_CLOSE)
        }

        BLOCK_OPEN_RE.find(trimmed)?.let {
            return token(GlyphTokenKind.BLOCK_OPEN, keyword = at(0, it.groupValues[1].length))
        }

        BLOCK_INLINE_RE.find(trimmed)?.let {
            return token(
                GlyphTokenKind.BLOCK_INLINE,
                keyword = at(0, it.groupValues[1].length),
                // Between the parens: the opener is the first `(`, and the
                // closer is the last character, since the pattern anchors it.
                inner = at(trimmed.indexOf('(') + 1, trimmed.length - 1),
            )
        }

        REF_OPEN_RE.find(line)?.let {
            return token(GlyphTokenKind.REF_OPEN, key = Part(0, it.groupValues[1].length))
        }

        // Heading level is deliberately unbounded: which levels a document may
        // use is a language rule the parser owns.
        HEADING_RE.find(trimmed)?.let {
            return token(
                GlyphTokenKind.HEADING,
                level = it.groupValues[1].length,
                content = tail(it.groupValues[2]),
            )
        }

        CENTERED_RE.find(trimmed)?.let {
            return token(GlyphTokenKind.CENTERED_TEXT, content = tail(it.groupValues[1]))
        }

        if (trimmed.startsWith(";")) return token(GlyphTokenKind.TRAIT_LINE)

        // A line that is *only* `{{key}}` is its own token; inline uses like
        // "Hello {{name}}!" fall through to text and stay literal.
        REFERENCE_RE.find(trimmed)?.let {
            return token(GlyphTokenKind.REFERENCE, key = at(2, trimmed.length - 2))
        }

        if (trimmed.startsWith("* ") || (trimmed.startsWith("- ") && trimmed.length > 2)) {
            return token(GlyphTokenKind.LIST_ITEM, content = at(2, trimmed.length))
        }

        FOOTNOTE_RE.find(trimmed)?.let {
            val markerStart = trimmed.indexOf('[') + 1
            return token(
                GlyphTokenKind.FOOTNOTE_LINE,
                marker = at(markerStart, markerStart + it.groupValues[1].length),
                content = tail(it.groupValues[2]),
            )
        }

        if (trimmed.contains('|')) return token(GlyphTokenKind.PIPE_LINE)

        return token(GlyphTokenKind.TEXT)
    }

    // Longest first so `:aaa:` matches before `:aa:` before `:a:`.
    private val ACTION_TOKENS = listOf(":aaa:", ":aa:", ":a:", ":r:", ":f:")

    /**
     * Emphasis delimiters, longest run first. Order matters: `***`/`___` are
     * tried before `**`/`*` so a triple run binds as combined bold+italic
     * rather than a strong immediately followed by an em.
     *
     * NOTE: if strikethrough (`~~...~~`) is ever added, it must come *before*
     * the `~` entry, exactly as `**` precedes `*`.
     */
    private val EMPHASIS = listOf(
        "***" to InlineKind.STRONG_EM,
        "___" to InlineKind.STRONG_EM,
        "**" to InlineKind.STRONG,
        "__" to InlineKind.STRONG,
        "*" to InlineKind.EM,
        "_" to InlineKind.EM,
        // Superscript/subscript. Single-char, so no prefix overlap with the runs
        // above. The line-level `^ ` centered marker is caret+space and is
        // recognized before this runs, so it never collides with inline `^...^`.
        "^" to InlineKind.SUP,
        "~" to InlineKind.SUB,
    )

    /**
     * Locate the inline markup in a stretch of text.
     *
     * A port of `scanInline` in `libs/core/src/parser/lexer.ts`. Delimiters are
     * balanced on the same string and matched greedily, longest run first. There
     * is no arbitrary nesting — `**bold *italic* bold**` keeps the inner `*`s
     * literal. No escapes. Unbalanced delimiters and empty runs (`****`, `^^`)
     * are not runs at all, so they simply do not appear here.
     */
    fun scanInline(input: String): List<InlineSpan> {
        val out = mutableListOf<InlineSpan>()
        var i = 0

        while (i < input.length) {
            if (input[i] == ':') {
                val match = ACTION_TOKENS.firstOrNull { input.startsWith(it, i) }
                if (match != null) {
                    out += InlineSpan(InlineKind.ACTION, i, i + match.length, i, i + match.length)
                    i += match.length
                    continue
                }
            }

            var matched = false
            for ((delim, kind) in EMPHASIS) {
                if (!input.startsWith(delim, i)) continue
                val close = input.indexOf(delim, i + delim.length)
                // Require a closing delimiter with at least one character
                // between the two, otherwise fall through to a shorter one.
                if (close <= i + delim.length) continue
                out += InlineSpan(kind, i, close + delim.length, i + delim.length, close)
                i = close + delim.length
                matched = true
                break
            }
            if (matched) continue

            i++
        }

        return out
    }

    /**
     * Which part of a line carries prose, and so may hold inline markup.
     *
     * Most lines keep it in the part already located. A `text` or `pipe-line`
     * has none because the whole line is content — a pipe line included, since
     * `|` is not an emphasis delimiter and cells are prose like any other.
     * Lines that are pure structure have no prose at all.
     */
    private fun proseRegion(tok: GlyphToken): Part? = when (tok.kind) {
        GlyphTokenKind.HEADING,
        GlyphTokenKind.CENTERED_TEXT,
        GlyphTokenKind.LIST_ITEM,
        GlyphTokenKind.FOOTNOTE_LINE,
        -> tok.content

        GlyphTokenKind.BLOCK_INLINE -> tok.inner
        GlyphTokenKind.TEXT, GlyphTokenKind.PIPE_LINE -> Part(0, tok.raw.length)
        else -> null
    }

    /** Locate inline markup in a line's prose, in coordinates relative to the line. */
    private fun scanProse(tok: GlyphToken): List<InlineSpan> {
        val region = proseRegion(tok) ?: return emptyList()
        val shift = region.start
        val runs = scanInline(tok.raw.substring(region.start, region.end))
        if (shift == 0) return runs
        return runs.map {
            InlineSpan(
                it.kind,
                it.start + shift,
                it.end + shift,
                it.contentStart + shift,
                it.contentEnd + shift,
            )
        }
    }
}
