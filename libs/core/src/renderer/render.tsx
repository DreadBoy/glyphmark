import { renderToString } from 'react-dom/server';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import createEmotionServer from '@emotion/server/create-instance';
import type { ScribeDocument } from '../parser/scribe-parser.js';
import { isItem, Item } from '../components/info';
import { FONT_CSS } from '../vendor/font-css';
import { Document } from '../components/document';
import { Heading, isHeading } from '../components/heading';

export function renderScribeDocument(doc: ScribeDocument): string {
  const cache = createCache({ key: 'gm' });
  const { extractCriticalToChunks, constructStyleTagsFromChunks } =
    createEmotionServer(cache);

  const body = renderToString(
    <CacheProvider value={cache}>
      <Body doc={doc} />
    </CacheProvider>,
  );

  const styleTags = constructStyleTagsFromChunks(extractCriticalToChunks(body));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${FONT_CSS}</style>${styleTags}</head><body>${body}</body></html>`;
}

function Body({ doc }: { doc: ScribeDocument }) {
  return (
    <Document>
      {doc.body.map((node, index) => {
        if (isItem(node)) return <Item node={node} key={index} />;
        if (isHeading(node)) return <Heading node={node} key={index} />;
        return null;
      })}
    </Document>
  );
}
