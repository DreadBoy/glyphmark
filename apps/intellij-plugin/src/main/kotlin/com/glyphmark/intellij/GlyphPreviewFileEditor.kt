package com.glyphmark.intellij

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

    /** Lets the page tell us a render finished; see `preview/src/index.ts`. */
    private val renderCompleteQuery: JBCefJSQuery?

    /** Set once the shell page has loaded; before that, JS calls would be lost. */
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
            fallbackPanel = JPanel(BorderLayout()).apply {
                add(
                    JLabel(
                        "The Glyph preview requires JCEF, which is unavailable in this IDE.",
                        SwingConstants.CENTER,
                    ),
                    BorderLayout.CENTER,
                )
            }
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
                    ApplicationManager.getApplication().invokeLater { finishRendering() }
                }
                null
            }
            renderCompleteQuery = query

            jbCefBrowser.jbCefClient.addLoadHandler(
                object : CefLoadHandlerAdapter() {
                    override fun onLoadEnd(cefBrowser: CefBrowser?, frame: CefFrame?, httpStatusCode: Int) {
                        // Also fires for the srcdoc iframe holding the rendered
                        // document; only the shell's own load matters here.
                        if (frame?.isMain != true) return
                        shellLoaded = true
                        ApplicationManager.getApplication().invokeLater {
                            installCompletionBridge()
                            pushSourceToBrowser()
                        }
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

    /** Defines the function `preview/src/index.ts` calls when a render lands. */
    private fun installCompletionBridge() {
        val cefBrowser = browser?.cefBrowser ?: return
        val query = renderCompleteQuery ?: return
        cefBrowser.executeJavaScript(
            "window.glyphmarkRenderComplete = function(phase) { ${query.inject("phase")} };",
            cefBrowser.url ?: "",
            0,
        )
    }

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

    override fun getComponent(): JComponent = loadingPanel ?: fallbackPanel!!

    override fun getPreferredFocusedComponent(): JComponent? = browser?.component

    override fun getName(): String = "Glyph Preview"

    override fun getFile(): VirtualFile = file

    override fun setState(state: FileEditorState) = Unit

    override fun getState(level: FileEditorStateLevel): FileEditorState = FileEditorState.INSTANCE

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = file.isValid

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {
        propertyChangeSupport.addPropertyChangeListener(listener)
    }

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {
        propertyChangeSupport.removePropertyChangeListener(listener)
    }

    override fun dispose() {
        debounce.stop()
        showIndicator.stop()
    }
}
