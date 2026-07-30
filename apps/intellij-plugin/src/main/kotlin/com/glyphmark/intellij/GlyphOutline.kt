package com.glyphmark.intellij

/** What a node in the outline was scanned from. */
enum class GlyphOutlineKind { FILE, BLOCK, HEADING, REFERENCE }

/**
 * One entry of a document's outline: a heading, a `keyword(...)` block, or a
 * `key { ... }` content-ref definition.
 */
class GlyphOutlineNode(
    val kind: GlyphOutlineKind,
    /** Heading level (1..6); 0 for everything else. */
    val level: Int = 0,
    /** Block keyword (`item`, `info`, …), or `ref` for content-ref definitions. */
    val blockType: String? = null,
    val startOffset: Int = 0,
    /** Line this node opens on, and the last non-blank line before it. */
    internal val line: Int = -1,
    internal val prevContentLine: Int = -1,
) {
    var title: String = ""
    var subtitle: String? = null
    var endOffset: Int = 0
    val children: MutableList<GlyphOutlineNode> = mutableListOf()

    /** Offset just past the block's closing delimiter, once it's been seen. */
    internal var closeOffset: Int? = null

    /**
     * Position-independent identity, so the Structure view keeps its expanded
     * nodes and selection while you type somewhere else in the file.
     */
    var key: String = ""
        internal set

    override fun equals(other: Any?): Boolean = other is GlyphOutlineNode && other.key == key

    override fun hashCode(): Int = key.hashCode()

    override fun toString(): String = "$kind($title)"
}

/**
 * Scans `.glyph` text into an outline tree.
 *
 * Deliberately line-oriented and independent of `@glyphmark/core`: the plugin
 * can't run the TypeScript parser on the JVM, and an outline only needs the
 * document's skeleton — headings, blocks, content-ref definitions — not a full
 * parse. The line patterns mirror `libs/core/src/parser/lexer.ts`, including how
 * it finds a block's end by balancing delimiters.
 */
object GlyphOutline {

    private val BLOCK_OPEN = Regex("""^(item|info|rule|sample|head)\s*\(""")
    private val HEADING = Regex("""^(#{1,6})\s+(.+)$""")
    private val REF_DEF = Regex("""^(\w+)\s*\{\s*$""")
    private val ACTION_SYMBOL = Regex("""\s*:(?:aaa|aa|a|r|f):\s*""")
    private val INLINE_MARKUP = Regex("""[*_`^~]""")
    private val WHITESPACE = Regex("""\s+""")

    fun parse(text: CharSequence): GlyphOutlineNode {
        val root = GlyphOutlineNode(GlyphOutlineKind.FILE)
        val scopes = mutableListOf(Scope(root, null))
        var offset = 0
        var prevContentLine = -1

        for ((index, line) in text.toString().split('\n').withIndex()) {
            val trimmed = line.trim()
            if (trimmed.isNotEmpty()) {
                val block = BLOCK_OPEN.find(trimmed)
                val heading = if (block == null) HEADING.matchEntire(trimmed) else null
                val ref = if (block == null && heading == null) REF_DEF.matchEntire(line) else null

                when {
                    block != null -> {
                        val node = GlyphOutlineNode(
                            kind = GlyphOutlineKind.BLOCK,
                            blockType = block.groupValues[1],
                            startOffset = offset + line.indexOf(trimmed),
                            line = index,
                            prevContentLine = prevContentLine,
                        )
                        node.title = block.groupValues[1]
                        attach(scopes.last(), node)
                        scopes.add(Scope(node, ')'))
                        balance(scopes, line, line.indexOf('('), offset)
                    }

                    ref != null -> {
                        val node = GlyphOutlineNode(
                            kind = GlyphOutlineKind.REFERENCE,
                            blockType = "ref",
                            startOffset = offset,
                            line = index,
                            prevContentLine = prevContentLine,
                        )
                        node.title = ref.groupValues[1]
                        attach(scopes.last(), node)
                        scopes.add(Scope(node, '}'))
                        balance(scopes, line, line.indexOf('{'), offset)
                    }

                    heading != null -> {
                        val node = GlyphOutlineNode(
                            kind = GlyphOutlineKind.HEADING,
                            level = heading.groupValues[1].length,
                            startOffset = offset + line.indexOf(trimmed),
                            line = index,
                            prevContentLine = prevContentLine,
                        )
                        node.title = plainText(heading.groupValues[2])
                        attachHeading(scopes.last(), node)
                        balance(scopes, line, 0, offset)
                    }

                    else -> balance(scopes, line, 0, offset)
                }
                prevContentLine = index
            }
            offset += line.length + 1
        }

        promoteBlockTitles(root)
        assignEnds(root, text.length)
        assignKeys(root, "")
        return root
    }

    /** An open container: the document, a `keyword(...)` block, or a `key { ... }`. */
    private class Scope(val container: GlyphOutlineNode, val closer: Char?) {
        var depth = 0
        val headings = mutableListOf<GlyphOutlineNode>()
    }

    /**
     * Tracks delimiter nesting from [from] to the end of the line, closing
     * scopes as their delimiter balances out. Only the innermost open scope
     * counts characters — a nested block consumes its own region, so the outer
     * scope resumes counting where the inner one left off.
     */
    private fun balance(scopes: MutableList<Scope>, line: String, from: Int, lineOffset: Int) {
        if (from < 0) return
        for (i in from until line.length) {
            val scope = scopes.last()
            val closer = scope.closer ?: return
            val opener = if (closer == ')') '(' else '{'
            when (line[i]) {
                opener -> scope.depth++
                closer -> {
                    scope.depth--
                    if (scope.depth <= 0) {
                        scope.container.closeOffset = lineOffset + i + 1
                        scopes.removeAt(scopes.lastIndex)
                    }
                }
            }
        }
    }

    private fun attach(scope: Scope, node: GlyphOutlineNode) {
        (scope.headings.lastOrNull() ?: scope.container).children.add(node)
    }

    private fun attachHeading(scope: Scope, node: GlyphOutlineNode) {
        while (scope.headings.lastOrNull()?.let { it.level >= node.level } == true) {
            scope.headings.removeAt(scope.headings.lastIndex)
        }
        attach(scope, node)
        scope.headings.add(node)
    }

    /**
     * A block's leading `#` is its name and a `##` right after it is its
     * subtitle — that's how `parseItem` reads them — so label the block with
     * them instead of listing them as children.
     */
    private fun promoteBlockTitles(node: GlyphOutlineNode) {
        node.children.forEach(::promoteBlockTitles)
        if (node.kind != GlyphOutlineKind.BLOCK) return

        val name = node.children.firstOrNull() ?: return
        if (name.kind != GlyphOutlineKind.HEADING || name.level != 1) return
        if (name.prevContentLine != node.line) return

        node.title = name.title
        val promoted = mutableListOf<GlyphOutlineNode>()
        val subtitle = name.children.firstOrNull()
        if (subtitle != null &&
            subtitle.kind == GlyphOutlineKind.HEADING &&
            subtitle.level == 2 &&
            subtitle.prevContentLine == name.line
        ) {
            node.subtitle = subtitle.title
            promoted += subtitle.children
            promoted += name.children.drop(1)
        } else {
            promoted += name.children
        }
        node.children.removeAt(0)
        node.children.addAll(0, promoted)
    }

    /**
     * A node covers everything up to its next sibling — that's what makes
     * "select the entry the caret is in" work for headings, which have no
     * closing delimiter of their own.
     */
    private fun assignEnds(node: GlyphOutlineNode, fallback: Int) {
        val end = node.closeOffset ?: fallback
        node.endOffset = end
        node.children.forEachIndexed { i, child ->
            assignEnds(child, node.children.getOrNull(i + 1)?.startOffset ?: end)
        }
    }

    private fun assignKeys(node: GlyphOutlineNode, prefix: String) {
        node.key = prefix
        val seen = mutableMapOf<String, Int>()
        for (child in node.children) {
            val base = "${child.kind}:${child.level}:${child.title}"
            val ordinal = seen.merge(base, 1, Int::plus)
            assignKeys(child, "$prefix/$base#$ordinal")
        }
    }

    /** Strips inline markup and action symbols so titles read as plain text. */
    private fun plainText(raw: String): String = raw
        .replace(ACTION_SYMBOL, " ")
        .replace(INLINE_MARKUP, "")
        .replace(WHITESPACE, " ")
        .trim()
}
