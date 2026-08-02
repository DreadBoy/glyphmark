package com.glyphmark.intellij

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.actionSystem.ex.CustomComponentAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.util.Key
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.event.ActionEvent
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import javax.swing.AbstractAction
import javax.swing.JComponent
import javax.swing.KeyStroke

/**
 * The preview panel's toolbar: zoom, fit to width, page number, refresh and the
 * scroll-sync toggle.
 *
 * **Why it lives on the preview and not on the split editor.**
 * [com.intellij.openapi.fileEditor.TextEditorWithPreview] offers the seam —
 * `createLeftToolbarActionGroup` and friends — and it was the obvious place to
 * put this. It loses on one point: a toolbar owned by the composite stays
 * visible in `Layout.SHOW_EDITOR`, where every control here would be acting on
 * a panel that is not on screen. Owning it in the preview makes it appear and
 * vanish with the thing it controls.
 *
 * **Why the actions are not registered in `plugin.xml`.** Each one acts on one
 * particular preview instance, so they are constructed with a reference to it
 * rather than looking one up through a `DataKey`. The cost is that they get no
 * keymap entries and do not show up in Search Everywhere, which is a fair trade
 * for controls that only mean anything while looking at the panel they sit on.
 */
fun createPreviewToolbar(preview: GlyphPreviewFileEditor, targetComponent: JComponent): ActionToolbar {
    val group = DefaultActionGroup(
        ZoomOutAction(preview),
        ZoomLabelAction(preview),
        ZoomInAction(preview),
        FitWidthAction(preview),
        Separator.getInstance(),
        PageFieldAction(preview),
        PageCountLabelAction(preview),
        Separator.getInstance(),
        RefreshAction(preview),
        ScrollSyncAction(preview),
    )

    val toolbar = ActionManager.getInstance().createActionToolbar(TOOLBAR_PLACE, group, true)
    toolbar.targetComponent = targetComponent
    return toolbar
}

private const val TOOLBAR_PLACE = "GlyphPreviewToolbar"

/**
 * Toolbars rebuild their custom components whenever they please, so the value a
 * component shows can never live in the component. It is written into the
 * action's [Presentation] during `update` and rendered from there in
 * `updateCustomComponent` — otherwise the page number quietly stops updating
 * after the first rebuild.
 */
private val TEXT_KEY = Key.create<String>("glyphmark.toolbar.text")

/** Everything here is [DumbAware]: nothing it does needs an index. */
private abstract class PreviewAction(
    protected val preview: GlyphPreviewFileEditor,
) : AnAction(), DumbAware {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT
}

private class ZoomInAction(preview: GlyphPreviewFileEditor) : PreviewAction(preview) {
    init {
        templatePresentation.text = "Zoom In"
        templatePresentation.icon = AllIcons.General.ZoomIn
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = preview.isLive() && preview.zoomPercent < GlyphZoom.MAX
    }

    override fun actionPerformed(event: AnActionEvent) {
        preview.setZoom(GlyphZoom.zoomIn(preview.zoomPercent))
    }
}

private class ZoomOutAction(preview: GlyphPreviewFileEditor) : PreviewAction(preview) {
    init {
        templatePresentation.text = "Zoom Out"
        templatePresentation.icon = AllIcons.General.ZoomOut
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = preview.isLive() && preview.zoomPercent > GlyphZoom.MIN
    }

    override fun actionPerformed(event: AnActionEvent) {
        preview.setZoom(GlyphZoom.zoomOut(preview.zoomPercent))
    }
}

/** Shows the level, and says so when it is being tracked rather than chosen. */
private class ZoomLabelAction(
    private val preview: GlyphPreviewFileEditor,
) : AnAction(), CustomComponentAction, DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun update(event: AnActionEvent) {
        val zoom = GlyphZoom.format(preview.zoomPercent)
        event.presentation.putClientProperty(TEXT_KEY, if (preview.fitWidth) "Fit · $zoom" else zoom)
    }

    override fun actionPerformed(event: AnActionEvent) = Unit

    override fun createCustomComponent(presentation: Presentation, place: String): JComponent =
        JBLabel(presentation.getClientProperty(TEXT_KEY) ?: "").apply {
            border = JBUI.Borders.empty(0, 4)
        }

    override fun updateCustomComponent(component: JComponent, presentation: Presentation) {
        (component as JBLabel).text = presentation.getClientProperty(TEXT_KEY) ?: ""
    }
}

private class FitWidthAction(
    private val preview: GlyphPreviewFileEditor,
) : ToggleAction("Fit Page Width", "Keep the page as wide as the preview", AllIcons.General.FitContent), DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun isSelected(event: AnActionEvent): Boolean = preview.fitWidth

    override fun setSelected(event: AnActionEvent, state: Boolean) {
        preview.setFitWidth(state)
    }

    override fun update(event: AnActionEvent) {
        super.update(event)
        event.presentation.isEnabled = preview.isLive()
    }
}

/**
 * The page the reader is on, and where they type to go somewhere else.
 *
 * Deliberately not overwritten while it has focus: the field is an input as
 * well as a readout, and a status update landing mid-keystroke would eat what
 * they were typing.
 */
private class PageFieldAction(
    private val preview: GlyphPreviewFileEditor,
) : AnAction(), CustomComponentAction, DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = preview.isLive() && preview.pageCount > 0
        event.presentation.putClientProperty(TEXT_KEY, preview.currentPage.toString())
    }

    override fun actionPerformed(event: AnActionEvent) = Unit

    override fun createCustomComponent(presentation: Presentation, place: String): JComponent =
        JBTextField(presentation.getClientProperty(TEXT_KEY) ?: "1", 3).apply {
            toolTipText = "Go to page"
            horizontalAlignment = JBTextField.RIGHT

            val jump = object : AbstractAction() {
                override fun actionPerformed(e: ActionEvent) {
                    val page = text.trim().toIntOrNull()
                    // Garbage, zero, or a page past the end is not worth an error
                    // popup — putting the real page number back says what
                    // happened, and the reader can try again.
                    if (page != null && page >= 1 && page <= preview.pageCount) preview.goToPage(page)
                    else text = preview.currentPage.toString()
                }
            }
            getInputMap(JComponent.WHEN_FOCUSED)
                .put(KeyStroke.getKeyStroke("ENTER"), "glyphmark.goToPage")
            actionMap.put("glyphmark.goToPage", jump)

            addFocusListener(object : FocusAdapter() {
                // Leaving a half-typed number behind would make the field lie
                // about where the reader is.
                override fun focusLost(e: FocusEvent) {
                    text = preview.currentPage.toString()
                }
            })
        }

    override fun updateCustomComponent(component: JComponent, presentation: Presentation) {
        val field = component as JBTextField
        field.isEnabled = presentation.isEnabled
        if (field.hasFocus()) return
        val text = presentation.getClientProperty(TEXT_KEY) ?: return
        if (field.text != text) field.text = text
    }
}

private class PageCountLabelAction(
    private val preview: GlyphPreviewFileEditor,
) : AnAction(), CustomComponentAction, DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun update(event: AnActionEvent) {
        val count = preview.pageCount
        // An error page and a document still paginating both have no pages to
        // count; "/ ?" is honest, where "/ 0" reads like a broken document.
        event.presentation.putClientProperty(TEXT_KEY, if (count > 0) "/ $count" else "/ ?")
    }

    override fun actionPerformed(event: AnActionEvent) = Unit

    override fun createCustomComponent(presentation: Presentation, place: String): JComponent =
        JBLabel(presentation.getClientProperty(TEXT_KEY) ?: "").apply {
            border = JBUI.Borders.empty(0, 4)
        }

    override fun updateCustomComponent(component: JComponent, presentation: Presentation) {
        (component as JBLabel).text = presentation.getClientProperty(TEXT_KEY) ?: ""
    }
}

private class RefreshAction(preview: GlyphPreviewFileEditor) : PreviewAction(preview) {
    init {
        templatePresentation.text = "Refresh Preview"
        templatePresentation.description = "Render the document again now"
        templatePresentation.icon = AllIcons.Actions.Refresh
    }

    // Disabled rather than silently doing nothing: before the shell page has
    // loaded there is no browser to render into, and a button that looks live
    // but is not is worse than one that is plainly unavailable.
    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = preview.isLive()
    }

    override fun actionPerformed(event: AnActionEvent) {
        preview.refresh()
    }
}

private class ScrollSyncAction(
    private val preview: GlyphPreviewFileEditor,
) : ToggleAction(
    "Sync Scrolling",
    "Keep the preview on the part of the document the editor is showing",
    AllIcons.Actions.SynchronizeScrolling,
), DumbAware {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun isSelected(event: AnActionEvent): Boolean = preview.scrollSyncEnabled

    override fun setSelected(event: AnActionEvent, state: Boolean) {
        preview.scrollSyncEnabled = state
    }
}
