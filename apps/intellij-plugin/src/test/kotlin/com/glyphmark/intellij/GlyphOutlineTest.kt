package com.glyphmark.intellij

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class GlyphOutlineTest {

    /** `kind:level title [location]` per line, indented by depth. */
    private fun dump(node: GlyphOutlineNode, depth: Int = 0): String =
        node.children.joinToString("") { child ->
            val subtitle = child.subtitle?.let { " ($it)" } ?: ""
            "  ".repeat(depth) + "${child.kind}:${child.level} ${child.title}$subtitle\n" +
                dump(child, depth + 1)
        }

    @Test
    fun `nests headings by level`() {
        val outline = GlyphOutline.parse(
            """
            # Faiths and Philosophies

            Prose.

            ## Atheism

            ### Edicts

            #### Anathema

            ## Animism
            """.trimIndent(),
        )

        assertEquals(
            """
            HEADING:1 Faiths and Philosophies
              HEADING:2 Atheism
                HEADING:3 Edicts
                  HEADING:4 Anathema
              HEADING:2 Animism
            """.trimIndent() + "\n",
            dump(outline),
        )
    }

    @Test
    fun `labels a block with its leading heading and subtitle`() {
        val outline = GlyphOutline.parse(
            """
            item(
            # Pet
            ## Feat 1
            -
            ;General

            You have a pet.
            )
            """.trimIndent(),
        )

        assertEquals("BLOCK:0 Pet (Feat 1)\n", dump(outline))
        assertEquals("item", outline.children.single().blockType)
    }

    @Test
    fun `keeps a block's later headings as children`() {
        val outline = GlyphOutline.parse(
            """
            rule(
            # Extra Preparation

            Prose.

            ## Ending or Interrupting Tasks

            More prose.
            )
            """.trimIndent(),
        )

        assertEquals(
            """
            BLOCK:0 Extra Preparation
              HEADING:2 Ending or Interrupting Tasks
            """.trimIndent() + "\n",
            dump(outline),
        )
        assertNull(outline.children.single().subtitle)
    }

    @Test
    fun `nests blocks under the heading they follow`() {
        val outline = GlyphOutline.parse(
            """
            # BACKGROUNDS

            head(
            # BACKGROUNDS

            Prose.
            )

            item(
            # ACOLYTE
            ## BACKGROUND
            -
            )

            item(
            # ACROBAT
            ## BACKGROUND
            -
            )
            """.trimIndent(),
        )

        assertEquals(
            """
            HEADING:1 BACKGROUNDS
              BLOCK:0 BACKGROUNDS
              BLOCK:0 ACOLYTE (BACKGROUND)
              BLOCK:0 ACROBAT (BACKGROUND)
            """.trimIndent() + "\n",
            dump(outline),
        )
    }

    @Test
    fun `parentheses in prose don't end a block early`() {
        val outline = GlyphOutline.parse(
            """
            item(
            # Pet
            -

            A Tiny animal (such as a cat) of your choice.
            )

            # After
            """.trimIndent(),
        )

        assertEquals(
            """
            BLOCK:0 Pet
            HEADING:1 After
            """.trimIndent() + "\n",
            dump(outline),
        )
    }

    @Test
    fun `nested blocks close independently`() {
        val outline = GlyphOutline.parse(
            """
            rule(
            # Outer

            item(
            # Inner
            -
            )

            ## Trailing
            )

            # After
            """.trimIndent(),
        )

        assertEquals(
            """
            BLOCK:0 Outer
              BLOCK:0 Inner
              HEADING:2 Trailing
            HEADING:1 After
            """.trimIndent() + "\n",
            dump(outline),
        )
    }

    @Test
    fun `lists content-ref definitions and their headings`() {
        val outline = GlyphOutline.parse(
            """
            sidebar {
            # Common Lore

            Prose.
            }

            {{sidebar}}
            """.trimIndent(),
        )

        assertEquals(
            """
            REFERENCE:0 sidebar
              HEADING:1 Common Lore
            """.trimIndent() + "\n",
            dump(outline),
        )
    }

    @Test
    fun `strips inline markup and action symbols from titles`() {
        val outline = GlyphOutline.parse("# **Strike** :aa: and _more_")

        assertEquals("Strike and more", outline.children.single().title)
    }

    @Test
    fun `a heading spans up to its next sibling`() {
        val text = """
            # One

            Prose.

            # Two
        """.trimIndent()
        val outline = GlyphOutline.parse(text)

        val (one, two) = outline.children
        assertEquals(0, one.startOffset)
        assertEquals(two.startOffset, one.endOffset)
        assertEquals(text.length, two.endOffset)
    }

    @Test
    fun `keys survive edits elsewhere in the file`() {
        val before = GlyphOutline.parse("# One\n\n## Two\n")
        val after = GlyphOutline.parse("Added a line.\n\n# One\n\nEdited.\n\n## Two\n")

        assertEquals(
            before.children.single().children.single(),
            after.children.single().children.single(),
        )
    }
}
