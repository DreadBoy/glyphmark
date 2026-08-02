package com.glyphmark.intellij

import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBLoadingPanel
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefLoadHandlerAdapter
import java.awt.BorderLayout
import java.beans.PropertyChangeListener
import java.beans.PropertyChangeSupport
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants
import javax.swing.Timer

private const val RENDER_DEBOUNCE_MS = 300

/**
 * How long a render may run before the loading indicator appears. Short enough
 * to cover a slow document, long enough that ordinary edits to a small file do
 * not flash a spinner on every keystroke.
 */
private const val LOADING_INDICATOR_DELAY_MS = 200

/**
 * Preview half of the split editor: a JCEF browser that renders the `.glyph`
 * document.
 *
 * Rendering happens *inside* the browser rather than in a helper process — the
 * bundled `preview/bundle.js` is `@glyphmark/core` compiled for the browser, so
 * the preview goes through the same parser and renderer as the CLI without
 * requiring Node on the user's machine.
 */
class GlyphPreviewFileEditor(private val file: VirtualFile) : UserDataHolderBase(), FileEditor {

    private val propertyChangeSupport = PropertyChangeSupport(this)
    private val document: Document? = FileDocumentManager.getInstance().getDocument(file)

    private val browser: JBCefBrowser?

    /**
     * Wraps the browser so the IDE's own spinner can be drawn over it. The
     * indicator runs on the EDT while rendering blocks the browser's JavaScript
     * thread, so it keeps animating where an in-page spinner would freeze.
     */
    private val loadingPanel: JBLoadingPanel?
    private val fallbackPanel: JPanel?

    /**
     * Holds the toolbar above whichever of the two panels this editor got, so
     * the JCEF-unsupported branch is not a second component shape to reason
     * about.
     */
    private val root = JPanel(BorderLayout())

    private val toolbar: ActionToolbar?

    /** Lets the page tell us a render finished; see `preview/src/index.ts`. */
    private val renderCompleteQuery: JBCefJSQuery?

    /**
     * Carries page position and the fit factor back from the page. Separate
     * from [renderCompleteQuery] on purpose: completion is a lifecycle signal
     * consumed once per render, this is a stream that ticks while the reader
     * scrolls, and folding them together would leave the completion handler
     * parsing and dispatching.
     */
    private val statusQuery: JBCefJSQuery?

    /**
     * Zoom as an integer percentage — the same unit [GlyphZoom] and
     * [GlyphPreviewState] use. This side is authoritative: the page is told what
     * the level is and never reports one back, so the toolbar label cannot
     * flicker on a round trip.
     */
    var zoomPercent: Int = GlyphZoom.DEFAULT
        private set

    var fitWidth: Boolean = false
        private set

    var currentPage: Int = 1
        private set

    var pageCount: Int = 0
        private set

    /**
     * Set from [setState] before a sync exists, and applied to it on
     * [attachScrollSync]. Once attached, [GlyphScrollSync] is the authority —
     * it owns the behaviour and the dedup that a catch-up has to defeat — and
     * this field is only the seed.
     */
    private var scrollSyncSeed = true

    private var scrollSync: GlyphScrollSync? = null

    /**
     * Read from a CEF thread on the way to the EDT. A plain flag rather than
     * `Disposer.isDisposed(this)`, which would depend on this editor being a
     * registered node in the Disposer tree.
     */
    @Volatile
    private var disposed = false

    /**
     * Set once the shell page has loaded; before that, JS calls would be lost.
     * Written from CEF's load-handler thread and read on the EDT, hence
     * `@Volatile`.
     */
    @Volatile
    private var shellLoaded = false

    private var rendering = false

    private val debounce = Timer(RENDER_DEBOUNCE_MS) { pushSourceToBrowser() }.apply {
        isRepeats = false
    }

    private val showIndicator = Timer(LOADING_INDICATOR_DELAY_MS) {
        if (rendering) loadingPanel?.startLoading()
    }.apply {
        isRepeats = false
    }

    init {
        if (!JBCefApp.isSupported()) {
            browser = null
            loadingPanel = null
            renderCompleteQuery = null
            statusQuery = null
            // No toolbar here: every control on it targets a browser that does
            // not exist, and a fully disabled toolbar over an error message is
            // just noise.
            toolbar = null
            fallbackPanel = JPanel(BorderLayout()).apply {
                add(
                    JLabel(
                        "The Glyph preview requires JCEF, which is unavailable in this IDE.",
                        SwingConstants.CENTER,
                    ),
                    BorderLayout.CENTER,
                )
            }
            root.add(fallbackPanel, BorderLayout.CENTER)
        } else {
            fallbackPanel = null
            val jbCefBrowser = JBCefBrowser()
            browser = jbCefBrowser
            Disposer.register(this, jbCefBrowser)

            val panel = JBLoadingPanel(BorderLayout(), this)
            panel.setLoadingText("Rendering preview…")
            panel.add(jbCefBrowser.component, BorderLayout.CENTER)
            loadingPanel = panel

            // Must exist before the browser loads anything, so the injected
            // callback is available the first time the page calls it.
            val query = JBCefJSQuery.create(jbCefBrowser as com.intellij.ui.jcef.JBCefBrowserBase)
            Disposer.register(this, query)
            query.addHandler { phase ->
                // 'first-page' is the one that matters: paged.js keeps laying
                // pages out for seconds afterwards on a large document, and the
                // preview is readable long before that finishes.
                if (phase == "first-page") {
                    ApplicationManager.getApplication().invokeLater({ finishRendering() }, { disposed })
                }
                null
            }
            renderCompleteQuery = query

            val status = JBCefJSQuery.create(jbCefBrowser as com.intellij.ui.jcef.JBCefBrowserBase)
            Disposer.register(this, status)
            status.addHandler { payload ->
                ApplicationManager.getApplication().invokeLater({ applyStatus(payload) }, { disposed })
                null
            }
            statusQuery = status

            val bar = createPreviewToolbar(this, jbCefBrowser.component)
            toolbar = bar
            root.add(bar.component, BorderLayout.NORTH)
            root.add(panel, BorderLayout.CENTER)

            jbCefBrowser.jbCefClient.addLoadHandler(
                object : CefLoadHandlerAdapter() {
                    override fun onLoadEnd(cefBrowser: CefBrowser?, frame: CefFrame?, httpStatusCode: Int) {
                        // Also fires for the srcdoc iframe holding the rendered
                        // document; only the shell's own load matters here.
                        if (frame?.isMain != true) return
                        shellLoaded = true
                        ApplicationManager.getApplication().invokeLater({
                            installJsBridges()
                            // Whatever `setState` restored while there was no
                            // page to tell about it.
                            pushViewSettingsToBrowser()
                            pushSourceToBrowser()
                            // Every control is gated on `isLive()`, which only
                            // becomes true here. Without this they sit greyed
                            // out until the toolbar's own polling notices —
                            // brief, but it is the first thing the reader sees.
                            toolbar?.updateActionsAsync()
                        }, { disposed })
                    }
                },
                jbCefBrowser.cefBrowser,
            )

            jbCefBrowser.loadHTML(shellHtml())

            ApplicationManager.getApplication().messageBus.connect(this).subscribe(
                EditorColorsManager.TOPIC,
                EditorColorsListener { pushBackdropToBrowser() },
            )

            document?.addDocumentListener(
                object : DocumentListener {
                    override fun documentChanged(event: DocumentEvent) {
                        debounce.restart()
                    }
                },
                this,
            )
        }
    }

    /** Defines the functions `preview/src/index.ts` calls back into. */
    private fun installJsBridges() {
        val cefBrowser = browser?.cefBrowser ?: return
        renderCompleteQuery?.let { query ->
            cefBrowser.executeJavaScript(
                "window.glyphmarkRenderComplete = function(phase) { ${query.inject("phase")} };",
                cefBrowser.url ?: "",
                0,
            )
        }
        statusQuery?.let { query ->
            cefBrowser.executeJavaScript(
                "window.glyphmarkStatus = function(payload) { ${query.inject("payload")} };",
                cefBrowser.url ?: "",
                0,
            )
        }
    }

    /**
     * `"<currentPage>|<pageCount>|<fitPercent>"`. Always three numeric fields,
     * so there is nothing to escape and no shape to branch on.
     *
     * The fit percentage is the one number the page is authoritative about —
     * only it can measure the frame — and it arrives as 0 when it does not
     * apply.
     */
    private fun applyStatus(payload: String) {
        val fields = payload.split('|')
        if (fields.size != 3) return

        currentPage = fields[0].toIntOrNull() ?: currentPage
        pageCount = fields[1].toIntOrNull() ?: pageCount
        fields[2].toIntOrNull()?.let { fit -> if (fitWidth && fit > 0) zoomPercent = GlyphZoom.clamp(fit) }

        toolbar?.updateActionsAsync()
    }

    /** Whether there is a loaded page behind this editor to act on. */
    fun isLive(): Boolean = browser != null && shellLoaded

    fun setZoom(percent: Int) {
        val clamped = GlyphZoom.clamp(percent)
        // Picking a level is picking not to track the width; the page makes the
        // same call, and the two have to agree or the toolbar lies.
        fitWidth = false
        zoomPercent = clamped
        callInPage("window.glyphmarkSetZoom($clamped)")
        toolbar?.updateActionsAsync()
    }

    fun setFitWidth(enabled: Boolean) {
        fitWidth = enabled
        callInPage("window.glyphmarkSetFitWidth($enabled)")
        toolbar?.updateActionsAsync()
    }

    fun goToPage(page: Int) {
        callInPage("window.glyphmarkGoToPage($page)")
    }

    /**
     * Renders again immediately, rather than waiting out the debounce.
     *
     * Mid-render this bumps the page's render token, which orphans the
     * in-flight render's completion signal — so `paginating` there stays set
     * until the new render finishes. Requests parked in the page survive that,
     * so nothing is lost; it is only a longer wait than usual.
     */
    fun refresh() {
        debounce.stop()
        pushSourceToBrowser()
    }

    /**
     * Pushes the view settings the page does not otherwise learn about.
     *
     * Both are pushed unconditionally, including when they are the defaults.
     * Sending only the non-default ones would make this a one-way ratchet:
     * `setState` restoring `100%, fit off` onto a page currently at `Fit · 150%`
     * would leave the document zoomed while the toolbar claimed otherwise. The
     * page is idempotent about being told what it already is.
     */
    private fun pushViewSettingsToBrowser() {
        callInPage("window.glyphmarkSetZoom($zoomPercent)")
        if (fitWidth) callInPage("window.glyphmarkSetFitWidth(true)")
    }

    private fun callInPage(script: String) {
        val cefBrowser = browser?.cefBrowser ?: return
        if (!shellLoaded) return
        cefBrowser.executeJavaScript(script, cefBrowser.url ?: "", 0)
    }

    /**
     * Whether the source editor drives the preview's scrolling.
     *
     * The flag itself belongs to [GlyphScrollSync], which owns both the
     * behaviour and the `lastSentLine` dedup that catching up has to defeat.
     * Before one is attached — [setState] can arrive first — the value is held
     * here and handed over in [attachScrollSync].
     */
    var scrollSyncEnabled: Boolean
        get() = scrollSync?.enabled ?: scrollSyncSeed
        set(value) {
            scrollSyncSeed = value
            scrollSync?.enabled = value
            toolbar?.updateActionsAsync()
        }

    fun attachScrollSync(sync: GlyphScrollSync) {
        scrollSync = sync
        sync.enabled = scrollSyncSeed
        toolbar?.updateActionsAsync()
    }

    fun detachScrollSync() {
        // Keep the last value, so the state written on close reflects the
        // toggle rather than reverting to whatever it started as.
        scrollSyncSeed = scrollSync?.enabled ?: scrollSyncSeed
        scrollSync = null
    }

    /**
     * Puts the preview on [line] (1-based).
     *
     * Returns whether the request actually reached the page: before the shell
     * has loaded there is nothing to call into, and the caller needs to know
     * that so it does not record the line as sent and then suppress every
     * retry as a duplicate. Delivered requests are best-effort from there on —
     * the page parks one that arrives mid-render until it has a paginated
     * document to measure against.
     */
    fun scrollToLine(line: Int): Boolean {
        val cefBrowser = browser?.cefBrowser ?: return false
        if (!shellLoaded) return false
        cefBrowser.executeJavaScript("window.glyphmarkScrollToLine($line)", cefBrowser.url ?: "", 0)
        return true
    }

    /** Whether the preview half is actually on screen; sync is pointless if not. */
    fun isShowing(): Boolean = root.isShowing

    /**
     * The editor's background, so the area around the page matches the IDE
     * theme instead of being white in a dark one. The page itself stays white:
     * it is paper, and its styles are the renderer's output.
     */
    private fun backdropColor(): String {
        val background = EditorColorsManager.getInstance().globalScheme.defaultBackground
        return String.format("#%02x%02x%02x", background.red, background.green, background.blue)
    }

    private fun pushBackdropToBrowser() {
        val cefBrowser = browser?.cefBrowser ?: return
        if (!shellLoaded) return
        cefBrowser.executeJavaScript(
            "window.glyphmarkSetBackdrop(\"${backdropColor()}\")",
            cefBrowser.url ?: "",
            0,
        )
    }

    private fun pushSourceToBrowser() {
        val cefBrowser = browser?.cefBrowser ?: return
        if (!shellLoaded) return
        val source = document?.text ?: return

        startRendering()
        val escaped = StringUtil.escapeStringCharacters(source)
        cefBrowser.executeJavaScript("window.glyphmarkRender(\"$escaped\")", cefBrowser.url ?: "", 0)
    }

    private fun startRendering() {
        rendering = true
        showIndicator.restart()
    }

    private fun finishRendering() {
        rendering = false
        showIndicator.stop()
        loadingPanel?.stopLoading()
    }

    /**
     * The shell page hosting the renderer. The bundle is inlined rather than
     * loaded over `file://` so no resources need extracting to disk and the
     * page has no external requests to make.
     */
    private fun shellHtml(): String {
        val bundle = javaClass.getResourceAsStream("/preview/bundle.js")
            ?.bufferedReader()
            ?.use { it.readText() }
            ?: return "<!DOCTYPE html><html><body>Glyph preview bundle is missing from the plugin.</body></html>"

        // The backdrop is baked in rather than pushed after load, so the very
        // first paint is already themed instead of flashing white.
        val backdrop = backdropColor()

        return """
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="UTF-8">
                <style>
                  html, body { margin: 0; height: 100%; overflow: hidden; background: $backdrop; }
                  iframe { display: block; width: 100%; height: 100%; border: 0; }
                </style>
              </head>
              <body>
                <iframe id="preview"></iframe>
                <script>window.__glyphmarkBackdrop = "$backdrop";</script>
                <script>$bundle</script>
              </body>
            </html>
        """.trimIndent()
    }

    override fun getComponent(): JComponent = root

    /** The browser, never the toolbar — this editor is for reading. */
    override fun getPreferredFocusedComponent(): JComponent? = browser?.component

    override fun getName(): String = "Glyph Preview"

    override fun getFile(): VirtualFile = file

    /**
     * Restores the toolbar's settings.
     *
     * Stored always, and pushed to the page straight away when there is one.
     * This is not only a pre-load call: splitting a tab, dragging an editor into
     * its own window and `EditorHistoryManager` all deliver state to an editor
     * that is already showing, and deferring those unconditionally would read as
     * the zoom randomly reverting.
     */
    override fun setState(state: FileEditorState) {
        if (state !is GlyphPreviewState) return

        zoomPercent = GlyphZoom.clamp(state.zoomPercent)
        fitWidth = state.fitWidth
        scrollSyncEnabled = state.scrollSync

        if (shellLoaded) pushViewSettingsToBrowser()
        toolbar?.updateActionsAsync()
    }

    /**
     * `FULL` only: zoom is a view preference, not a navigation position, and
     * offering it at `NAVIGATION` would put it in the back/forward history.
     *
     * `scrollSyncEnabled` is read through its property rather than off a field,
     * because once a [GlyphScrollSync] is attached the live value lives there.
     */
    override fun getState(level: FileEditorStateLevel): FileEditorState =
        if (level == FileEditorStateLevel.FULL) {
            GlyphPreviewState(zoomPercent, fitWidth, scrollSyncEnabled)
        } else {
            FileEditorState.INSTANCE
        }

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = file.isValid

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {
        propertyChangeSupport.addPropertyChangeListener(listener)
    }

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {
        propertyChangeSupport.removePropertyChangeListener(listener)
    }

    override fun dispose() {
        disposed = true
        debounce.stop()
        showIndicator.stop()
    }
}
