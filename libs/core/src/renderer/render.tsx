import { renderToString } from 'react-dom/server';
import type { FC } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import createEmotionServer from '@emotion/server/create-instance';
import type { ScribeDocument, ScribeNode } from '../parser/scribe-parser';
import { FONT_CSS } from '../vendor/font-css';
import { Document } from '../components/document';
import { ItemBlock } from '../components/item-block';
import { Heading } from '../components/heading';
import { ColumnBreak } from '../components/column-break';
import { Paragraph } from '../components/paragraph';
import { Table } from '../components/table';

type NodeOf<T extends ScribeNode['type']> = Extract<ScribeNode, { type: T }>;
type Renderers = {
  [K in ScribeNode['type']]?: FC<{ node: NodeOf<K> }>;
};

const RENDERERS: Renderers = {
  item: ItemBlock,
  heading: Heading,
  'column-break': ColumnBreak,
  paragraph: Paragraph,
  table: Table,
};

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
        const Comp = RENDERERS[node.type] as
          | FC<{ node: ScribeNode }>
          | undefined;
        return Comp ? <Comp key={index} node={node} /> : null;
      })}
    </Document>
  );
}
