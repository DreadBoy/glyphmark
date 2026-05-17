import { renderToString } from 'react-dom/server';
import type { FC } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import createEmotionServer from '@emotion/server/create-instance';
import type { ScribeDocument, BodyNode } from '../parser';
import { FONT_CSS } from '../vendor/font-css';
import { PAGEDJS_POLYFILL } from '../vendor/pagedjs';
import { Document } from '../components/document';
import { ItemBlock } from '../components/item-block';
import { Heading } from '../components/heading';
import { ColumnBreak } from '../components/column-break';
import { PageBreak } from '../components/page-break';
import { Paragraph } from '../components/paragraph';
import { List } from '../components/list';
import { Table } from '../components/table';
import { SampleBlock } from '../components/sample-block';
import { RuleBlock } from '../components/rule-block';
import { HeadBlock } from '../components/head-block';
import {
  FullWidthStyles,
  FullWidthToggle,
} from '../components/full-width-toggle';
import { renderPageShadowTags } from '../components/page-shadow';

type NodeOf<T extends BodyNode['type']> = Extract<BodyNode, { type: T }>;
type Renderers = {
  [K in BodyNode['type']]?: FC<{ node: NodeOf<K> }>;
};

const RENDERERS: Renderers = {
  item: ItemBlock,
  heading: Heading,
  'column-break': ColumnBreak,
  'page-break': PageBreak,
  'full-width-toggle': FullWidthToggle,
  paragraph: Paragraph,
  list: List,
  table: Table,
  sample: SampleBlock,
  rule: RuleBlock,
  head: HeadBlock,
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

  const pageChrome = renderPageShadowTags();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${FONT_CSS}</style>${styleTags}${pageChrome}</head><body>${body}<script>${PAGEDJS_POLYFILL}</script></body></html>`;
}

function Body({ doc }: { doc: ScribeDocument }) {
  return (
    <Document>
      <FullWidthStyles body={doc.body} />
      {doc.body.map((node, index) => {
        const Comp = RENDERERS[node.type] as FC<{ node: BodyNode }> | undefined;
        return Comp ? <Comp key={index} node={node} /> : null;
      })}
    </Document>
  );
}
