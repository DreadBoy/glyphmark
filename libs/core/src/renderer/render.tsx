import { renderToStaticMarkup } from 'react-dom/server';
import type { ScribeDocument } from '../parser/scribe-parser.js';

export function renderScribeDocument(doc: ScribeDocument): string {
  return renderToStaticMarkup(<Document doc={doc} />);
}

function Document({ doc: _doc }: { doc: ScribeDocument }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
      </head>
      <body />
    </html>
  );
}
