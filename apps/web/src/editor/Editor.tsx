import {useEffect, useRef, useState} from 'react';
import {Content, EditorContent, useEditor} from '@tiptap/react';
import {useScribeCSS} from './useScribeCSS';
import {scribeExtensions} from './extensions';
import {loadDocument, saveDocument} from './storage';

const INITIAL_CONTENT = {
  type: 'doc',
  content: [{
    type: 'page',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Glyphmark' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Start typing, or use ' }, { type: 'text', marks: [{ type: 'bold' }], text: '/' }, { type: 'text', text: ' to insert blocks.' }] },
    ],
  }],
};

const SAVE_DELAY = 500;

export function Editor() {
  useScribeCSS();
  const [initialContent, setInitialContent] = useState<Content | undefined>(
    undefined,
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadDocument().then((saved) => {
      setInitialContent(saved ?? INITIAL_CONTENT);
    });
  }, []);

  const editor = useEditor(
    {
      extensions: scribeExtensions,
      content: initialContent,
      editorProps: {
        attributes: {},
        handleKeyDown(_view, event) {
          if (event.key === 'Escape') {
            return false;
          }
          return false;
        },
      },
      onUpdate({ editor }) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveDocument(editor.getJSON());
        }, SAVE_DELAY);
      },
    },
    [initialContent],
  );

  useEffect(() => {
    if (editor) {
      (window as any).__glyphmark_editor = editor;
    }
  }, [editor]);

  if (initialContent === undefined) {
    return null; // loading
  }

  return (
    <div className="editor-shell">
      <div id="result">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
