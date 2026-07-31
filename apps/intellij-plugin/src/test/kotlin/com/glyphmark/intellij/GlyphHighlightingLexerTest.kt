package com.glyphmark.intellij

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Checks the two things the platform actually requires of a `Lexer`, against the
 * whole fixture corpus.
 *
 * Neither is about which colour anything gets — they are about the contract. A
 * highlighter that classifies correctly but leaves a character uncovered, or
 * that answers differently depending on where the editor resumed scanning,
 * produces flickering or missing highlighting that is painful to track down
 * later.
 */
class GlyphHighlightingLexerTest {

    private val fixtures: List<File> by lazy {
        val dir = File("../../libs/core/test/golden").canonicalFile
        assertTrue(dir.isDirectory, "golden fixtures not found at $dir")
        dir.listFiles()!!
            .filter { it.isDirectory && File(it, "input.glyph").isFile }
            .sortedBy { it.name }
    }

    /** Every emitted range, as `start..end:TYPE`, for one full scan. */
    private fun scan(text: String, from: Int = 0): List<String> {
        val lexer = GlyphHighlightingLexer()
        lexer.start(text, from, text.length, 0)
        val out = mutableListOf<String>()
        while (lexer.tokenType != null) {
            out += "${lexer.tokenStart}..${lexer.tokenEnd}:${lexer.tokenType}"
            lexer.advance()
        }
        return out
    }

    @Test
    fun `covers every character exactly once`() {
        for (fixture in fixtures) {
            val text = File(fixture, "input.glyph").readText()
            val lexer = GlyphHighlightingLexer()
            lexer.start(text, 0, text.length, 0)

            var cursor = 0
            while (lexer.tokenType != null) {
                assertEquals(
                    cursor,
                    lexer.tokenStart,
                    "${fixture.name}: gap or overlap at $cursor",
                )
                assertTrue(
                    lexer.tokenEnd > lexer.tokenStart,
                    "${fixture.name}: empty token at $cursor",
                )
                cursor = lexer.tokenEnd
                lexer.advance()
            }
            assertEquals(text.length, cursor, "${fixture.name}: stops short of the end")
        }
    }

    @Test
    fun `restarting mid-document classifies the same as a full scan`() {
        // The editor relexes from a previous token boundary rather than from the
        // top, so a restart has to agree with the full scan from that point on.
        // Recognition needs a whole line, which is why the lexer backs up to the
        // line start — this is the test that keeps that honest.
        for (fixture in fixtures) {
            val text = File(fixture, "input.glyph").readText()
            val full = scan(text)

            for (piece in full) {
                val from = piece.substringBefore("..").toInt()
                if (from == 0) continue
                val resumed = scan(text, from)
                val expected = full.dropWhile { it.substringBefore("..").toInt() < from }
                assertEquals(
                    expected,
                    resumed,
                    "${fixture.name}: restart at $from diverges from the full scan",
                )
            }
        }
    }

    @Test
    fun `colours a heading's marker apart from its text`() {
        val pieces = scan("## Title")
        assertEquals(
            listOf(
                "0..3:GLYPH_HEADING_MARKER",
                "3..8:GLYPH_HEADING_TEXT",
            ),
            pieces,
        )
    }

    @Test
    fun `colours emphasis apart from its delimiters`() {
        assertEquals(
            listOf(
                "0..2:GLYPH_TEXT",
                "2..4:GLYPH_INLINE_MARKER",
                "4..8:GLYPH_STRONG",
                "8..10:GLYPH_INLINE_MARKER",
                "10..12:GLYPH_TEXT",
            ),
            scan("a **bold** b"),
        )
    }

    @Test
    fun `distinguishes bold, italic and the combined form`() {
        fun emphasised(text: String) =
            scan(text).single { it.endsWith("GLYPH_STRONG") || it.endsWith("GLYPH_EM") ||
                it.endsWith("GLYPH_STRONG_EM") }.substringAfter(':')

        assertEquals("GLYPH_STRONG", emphasised("**b**"))
        assertEquals("GLYPH_EM", emphasised("*i*"))
        assertEquals("GLYPH_STRONG_EM", emphasised("***bi***"))
    }

    @Test
    fun `gives an action symbol its own type, delimiters and all`() {
        // Unlike emphasis there is nothing enclosed, so the whole symbol is one
        // piece rather than markers wrapping content.
        assertEquals(
            listOf("0..5:GLYPH_TEXT", "5..9:GLYPH_ACTION_SYMBOL"),
            scan("Cast :aa:"),
        )
    }

    @Test
    fun `emphasis inside a heading keeps the heading's own colour around it`() {
        assertEquals(
            listOf(
                "0..2:GLYPH_HEADING_MARKER",
                "2..4:GLYPH_INLINE_MARKER",
                "4..8:GLYPH_STRONG",
                "8..10:GLYPH_INLINE_MARKER",
                "10..13:GLYPH_HEADING_TEXT",
            ),
            scan("# **Bold** hi"),
        )
    }

    @Test
    fun `gives a bullet its own type, apart from other line markers`() {
        // A `*` opening a list and a `^` opening centered text are both line
        // markers, but only the bullet should read as a bullet.
        assertEquals(
            listOf("0..2:GLYPH_LIST_MARKER", "2..5:GLYPH_TEXT"),
            scan("* one"),
        )
        assertEquals(
            listOf("0..2:GLYPH_MARKER", "2..5:GLYPH_TEXT"),
            scan("^ one"),
        )
    }

    @Test
    fun `dims the semicolon opening a trait line`() {
        assertEquals(
            listOf("0..1:GLYPH_MARKER", "1..11:GLYPH_TRAIT"),
            scan(";alpha,beta"),
        )
    }

    @Test
    fun `colours a block keyword apart from its parens`() {
        assertEquals(
            listOf("0..4:GLYPH_KEYWORD", "4..5:GLYPH_DELIMITER"),
            scan("item("),
        )
    }
}
