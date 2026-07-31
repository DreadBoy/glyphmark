package com.glyphmark.intellij

import com.intellij.lexer.LexerBase
import com.intellij.psi.TokenType
import com.intellij.psi.tree.IElementType

/**
 * Adapts [GlyphLexer] to the platform's `Lexer` contract.
 *
 * [GlyphLexer] emits one token per line with its parts located inside it; the
 * editor wants a flat run of coloured ranges. So each line is expanded here into
 * the pieces that deserve different colours — the `#` apart from the heading
 * text, the keyword apart from its parens — and the pieces tile the line with no
 * gaps, since the platform requires every character to belong to some token.
 */
class GlyphHighlightingLexer : LexerBase() {

    private data class Piece(val type: IElementType, val start: Int, val end: Int)

    private var buffer: CharSequence = ""
    private var endOffset = 0
    private var pieces: List<Piece> = emptyList()
    private var index = 0

    override fun start(
        buffer: CharSequence,
        startOffset: Int,
        endOffset: Int,
        initialState: Int,
    ) {
        this.buffer = buffer
        this.endOffset = endOffset

        // Recognition needs a whole line, but the platform may restart anywhere
        // a previous run reported a token boundary — and those include
        // mid-line boundaries like the start of a heading's text. Backing up to
        // the line start makes any restart point classify the same as a full
        // scan would; the pieces before `startOffset` are then dropped.
        var lineStart = startOffset
        while (lineStart > 0 && buffer[lineStart - 1] != '\n') lineStart--

        val text = buffer.subSequence(lineStart, endOffset).toString()
        val all = ArrayList<Piece>()
        val tokens = GlyphLexer.tokenize(text)
        for ((i, tok) in tokens.withIndex()) {
            expand(tok, lineStart, all)
            // The newline between lines. `tokenize` splits on it, so it belongs
            // to no token, but the editor needs it covered.
            val nl = lineStart + tok.endOffset
            if (i < tokens.size - 1 && nl < endOffset) {
                all += Piece(TokenType.WHITE_SPACE, nl, nl + 1)
            }
        }

        val kept = all.filter { it.end > startOffset && it.start < endOffset }.toMutableList()
        // The platform requires the first token to begin exactly at
        // `startOffset`, so a piece straddling it is clipped rather than dropped.
        if (kept.isNotEmpty()) {
            kept[0] = kept[0].copy(start = maxOf(kept[0].start, startOffset))
            val last = kept.size - 1
            kept[last] = kept[last].copy(end = minOf(kept[last].end, endOffset))
        }
        pieces = kept
        index = 0
    }

    override fun getState(): Int = 0

    override fun getTokenType(): IElementType? = pieces.getOrNull(index)?.type

    override fun getTokenStart(): Int = pieces[index].start

    override fun getTokenEnd(): Int = pieces[index].end

    override fun advance() {
        if (index < pieces.size) index++
    }

    override fun getBufferSequence(): CharSequence = buffer

    override fun getBufferEnd(): Int = endOffset

    private fun emphasisType(kind: InlineKind): IElementType = when (kind) {
        InlineKind.STRONG -> GlyphTokenTypes.STRONG
        InlineKind.EM -> GlyphTokenTypes.EM
        InlineKind.STRONG_EM -> GlyphTokenTypes.STRONG_EM
        InlineKind.SUP -> GlyphTokenTypes.SUP
        InlineKind.SUB -> GlyphTokenTypes.SUB
        // Handled by the caller, which emits one piece for the whole symbol.
        InlineKind.ACTION -> GlyphTokenTypes.ACTION_SYMBOL
    }

    /**
     * Break one line into coloured pieces, in order and without gaps.
     *
     * `base` is where the scanned text starts in the document, so the pieces
     * come out in document coordinates.
     */
    private fun expand(tok: GlyphToken, base: Int, out: MutableList<Piece>) {
        val lineStart = base + tok.startOffset
        val len = tok.raw.length
        if (len == 0) return

        fun piece(type: IElementType, from: Int, to: Int) {
            if (to > from) out += Piece(type, lineStart + from, lineStart + to)
        }

        /**
         * Emit `[from, to)` as prose, splitting out any emphasis the lexer found
         * inside it.
         *
         * The delimiters are coloured apart from what they wrap, so `**` recedes
         * and the bold text itself stands out — the token already carries both
         * ranges, so neither is re-derived here.
         */
        fun prose(base: IElementType, from: Int, to: Int) {
            var cursor = from
            for (run in tok.inline) {
                if (run.start < cursor || run.end > to) continue
                piece(base, cursor, run.start)
                if (run.kind == InlineKind.ACTION) {
                    piece(GlyphTokenTypes.ACTION_SYMBOL, run.start, run.end)
                } else {
                    piece(GlyphTokenTypes.INLINE_MARKER, run.start, run.contentStart)
                    piece(emphasisType(run.kind), run.contentStart, run.contentEnd)
                    piece(GlyphTokenTypes.INLINE_MARKER, run.contentEnd, run.end)
                }
                cursor = run.end
            }
            piece(base, cursor, to)
        }

        when (tok.kind) {
            GlyphTokenKind.BLANK -> piece(TokenType.WHITE_SPACE, 0, len)

            GlyphTokenKind.HIDDEN_DELIMITER,
            GlyphTokenKind.PAGE_BREAK,
            GlyphTokenKind.COLUMN_BREAK,
            GlyphTokenKind.FULL_WIDTH_TOGGLE,
            GlyphTokenKind.HR,
            -> piece(GlyphTokenTypes.LONE_MARKER, 0, len)

            GlyphTokenKind.BLOCK_CLOSE,
            GlyphTokenKind.REF_CLOSE,
            -> piece(GlyphTokenTypes.DELIMITER, 0, len)

            GlyphTokenKind.BLOCK_OPEN -> {
                val kw = tok.keyword!!
                piece(TokenType.WHITE_SPACE, 0, kw.start)
                piece(GlyphTokenTypes.KEYWORD, kw.start, kw.end)
                piece(GlyphTokenTypes.DELIMITER, kw.end, len)
            }

            GlyphTokenKind.BLOCK_INLINE -> {
                val kw = tok.keyword!!
                val inner = tok.inner!!
                piece(TokenType.WHITE_SPACE, 0, kw.start)
                piece(GlyphTokenTypes.KEYWORD, kw.start, kw.end)
                piece(GlyphTokenTypes.DELIMITER, kw.end, inner.start)
                prose(GlyphTokenTypes.TEXT, inner.start, inner.end)
                piece(GlyphTokenTypes.DELIMITER, inner.end, len)
            }

            GlyphTokenKind.REF_OPEN -> {
                val key = tok.key!!
                piece(GlyphTokenTypes.REFERENCE_KEY, key.start, key.end)
                piece(GlyphTokenTypes.DELIMITER, key.end, len)
            }

            GlyphTokenKind.HEADING -> {
                val content = tok.content!!
                piece(GlyphTokenTypes.HEADING_MARKER, 0, content.start)
                prose(GlyphTokenTypes.HEADING_TEXT, content.start, content.end)
                piece(GlyphTokenTypes.TEXT, content.end, len)
            }

            GlyphTokenKind.CENTERED_TEXT -> {
                val content = tok.content!!
                piece(GlyphTokenTypes.MARKER, 0, content.start)
                prose(GlyphTokenTypes.TEXT, content.start, content.end)
                piece(GlyphTokenTypes.TEXT, content.end, len)
            }

            GlyphTokenKind.LIST_ITEM -> {
                val content = tok.content!!
                piece(GlyphTokenTypes.LIST_MARKER, 0, content.start)
                prose(GlyphTokenTypes.TEXT, content.start, content.end)
                piece(GlyphTokenTypes.TEXT, content.end, len)
            }

            GlyphTokenKind.REFERENCE -> {
                val key = tok.key!!
                piece(GlyphTokenTypes.MARKER, 0, key.start)
                piece(GlyphTokenTypes.REFERENCE_KEY, key.start, key.end)
                piece(GlyphTokenTypes.MARKER, key.end, len)
            }

            GlyphTokenKind.FOOTNOTE_LINE -> {
                val marker = tok.marker!!
                val content = tok.content!!
                piece(GlyphTokenTypes.MARKER, 0, marker.start)
                piece(GlyphTokenTypes.FOOTNOTE_MARKER, marker.start, marker.end)
                piece(GlyphTokenTypes.MARKER, marker.end, content.start)
                prose(GlyphTokenTypes.TEXT, content.start, content.end)
            }

            GlyphTokenKind.TRAIT_LINE -> {
                // Dim the `;` like every other line marker, so the traits
                // themselves are what reads. Recognition already established
                // the line starts with one, so it is only being located here.
                val semi = tok.raw.indexOf(';')
                piece(GlyphTokenTypes.MARKER, 0, semi + 1)
                piece(GlyphTokenTypes.TRAIT, semi + 1, len)
            }

            GlyphTokenKind.PIPE_LINE -> {
                // Colour the separators, leave the cells as prose. Which row is
                // the header — or the rule — depends on the lines around this
                // one, so the highlighter treats them all alike.
                var cursor = 0
                for (i in 0 until len) {
                    if (tok.raw[i] != '|') continue
                    prose(GlyphTokenTypes.TEXT, cursor, i)
                    piece(GlyphTokenTypes.PIPE, i, i + 1)
                    cursor = i + 1
                }
                prose(GlyphTokenTypes.TEXT, cursor, len)
            }

            GlyphTokenKind.TEXT -> prose(GlyphTokenTypes.TEXT, 0, len)
        }
    }
}
