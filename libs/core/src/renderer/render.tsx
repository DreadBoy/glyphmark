import { renderToString } from 'react-dom/server';
import type { FC } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import createEmotionServer from '@emotion/server/create-instance';
import type { GlyphDocument, BodyNode, SidebarBlockNode } from '../parser';
import { FONT_CSS } from '../vendor/font-css';
import { PAGEDJS_POLYFILL } from '../vendor/pagedjs';
import {
  Document,
  PageGlobals,
  PAGE_CONTENT_HEIGHT,
} from '../components/document';
import { pt } from '../components/size-helper';
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
import { SidebarBlock, SidebarRail } from '../components/sidebar-block';
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
  const hasSidebar = doc.body.some((node) => node.type === 'sidebar');
  if (hasSidebar) return <SidebarLayout doc={doc} />;
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

function renderBodyNode(node: BodyNode, key: string | number) {
  const Comp = RENDERERS[node.type] as FC<{ node: BodyNode }> | undefined;
  return Comp ? <Comp key={key} node={node} /> : null;
}

// Page layout when the document has a sidebar. The body is split into pages at
// explicit page breaks (`=`), and each page is laid out independently — so a
// sidebar's rail belongs to the page it sits on. Guarded so sidebar-free
// documents keep the default flow.
function SidebarLayout({ doc }: { doc: GlyphDocument }) {
  const pages: BodyNode[][] = [];
  let current: BodyNode[] = [];
  pages.push(current);
  for (const node of doc.body) {
    if (node.type === 'page-break') {
      current = [];
      pages.push(current);
    } else {
      current.push(node);
    }
  }
  return (
    <>
      <PageGlobals />
      <FullWidthStyles body={doc.body} />
      {pages.map((nodes, index) => (
        <SidebarPage
          key={index}
          nodes={nodes}
          last={index === pages.length - 1}
        />
      ))}
    </>
  );
}

// One page of a sidebar document. A page-height flex column: full-width head()
// bands sit on top; below them a row splits the page into a single-column main
// body and a full-height sidebar rail (right edge for now), separated by a
// keyline. Consecutive sidebars stack inside the one rail, which stays full
// height even when short.
function SidebarPage({ nodes, last }: { nodes: BodyNode[]; last: boolean }) {
  const banner: BodyNode[] = [];
  const sidebars: SidebarBlockNode[] = [];
  const main: BodyNode[] = [];
  for (const node of nodes) {
    if (node.type === 'sidebar') sidebars.push(node);
    else if (node.type === 'head') banner.push(node);
    else main.push(node);
  }
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        height: pt(PAGE_CONTENT_HEIGHT).toRem(),
        breakAfter: last ? undefined : 'page',
      }}
    >
      {banner.map((node, index) => renderBodyNode(node, `b${index}`))}
      <div css={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div css={{ flex: 1, minWidth: 0 }}>
          {main.map((node, index) => renderBodyNode(node, index))}
        </div>
        {sidebars.length > 0 && (
          <SidebarRail>
            {sidebars.map((node, index) => (
              <SidebarBlock key={`s${index}`} node={node} />
            ))}
          </SidebarRail>
        )}
      </div>
    </div>
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
