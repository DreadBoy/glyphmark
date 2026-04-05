import { useEditor, EditorContent } from '@tiptap/react';
import { useScribeCSS } from './useScribeCSS';
import { scribeExtensions } from './extensions';

const INITIAL_CONTENT = `
<h1>Welcome to Glyphmark</h1>
<p>Start typing, or use <strong>/</strong> to insert blocks.</p>
`;

export function Editor() {
  useScribeCSS();

  const editor = useEditor({
    extensions: scribeExtensions,
    content: INITIAL_CONTENT,
    editorProps: {
      attributes: {
        // No extra attributes on the tiptap wrapper
      },
      handleKeyDown(_view, event) {
        // Escape closes slash menu by blurring
        if (event.key === 'Escape') {
          return false;
        }
        return false;
      },
    },
  });

  return (
    <div id="result">
      <div data-markdown="1" className="bg-paper page d-flex flex-wrap">
        <div className="page-overlay" />
        <div data-markdown="1" className="flex-even column">
          <div data-markdown="1" className="content">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}
