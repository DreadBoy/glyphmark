package com.glyphmark.intellij

import com.intellij.openapi.actionSystem.ActionPromoter
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DataContext

/**
 * Puts the markup actions first when a keystroke matches several actions.
 *
 * Without this, ⌘B in a `.glyph` file runs Go to Declaration: both actions are
 * bound to it and both are enabled, and the platform simply takes the first
 * candidate. Being enabled is not enough to win — the order is what decides, and
 * a promoter is the supported way to change it. The bundled Markdown plugin
 * solves the same collision the same way, which is why ⌘B bolds in `.md` files
 * rather than jumping to a declaration.
 *
 * Promoting unconditionally is safe: [GlyphMarkupAction.update] already disables
 * these outside `.glyph` files, and a disabled action is skipped, so every other
 * file type still gets the IDE's own binding.
 */
class GlyphActionPromoter : ActionPromoter {

    override fun promote(actions: List<AnAction>, context: DataContext): List<AnAction> =
        actions.filterIsInstance<GlyphMarkupAction>()
}
