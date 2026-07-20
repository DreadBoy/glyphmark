import { renderToString } from 'react-dom/server';
import type { FC } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import createEmotionServer from '@emotion/server/create-instance';
import type { GlyphDocument, BodyNode } from '../parser';
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
import { InfoBlock } from '../components/info-block';
import { SidebarBlock } from '../components/sidebar-block';
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
  info: InfoBlock,
  sidebar: SidebarBlock,
};

export function renderToHtml(doc: GlyphDocument): string {
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

function Body({ doc }: { doc: GlyphDocument }) {
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

// PDF rendering reuses the HTML output and lets Chromium paginate it. We
// import Playwright lazily (via a dynamic import) so consumers that only
// need `renderToHtml` don't pay the cost of loading Playwright at module
// init — and so the import doesn't run in browser-side consumers of the
// library at all.
export async function renderToPdf(doc: GlyphDocument): Promise<Buffer> {
  const html = renderToHtml(doc);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();
    // Print media first so screen-only chrome (page shadows) is excluded
    // before paged.js paginates against the print stylesheet.
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.waitForSelector('.pagedjs_pages', { timeout: 30_000 });
    // `preferCSSPageSize` honours the document's own `@page { size: ... }`,
    // which paged.js already drives — so the PDF page geometry matches the
    // HTML preview exactly. `printBackground` keeps the styled backgrounds
    // (item-block headers, table stripes, etc.) from being stripped.
    return await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}
