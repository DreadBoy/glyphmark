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
import {
  FullWidthStyles,
  FullWidthToggle,
} from '../components/full-width-toggle';
import { renderPageShadowTags } from '../components/page-shadow';
import { createAnchorFn, NO_ANCHORS, type AnchorFn } from './source-anchors';

type NodeOf<T extends BodyNode['type']> = Extract<BodyNode, { type: T }>;
type Renderers = {
  [K in BodyNode['type']]?: FC<{ node: NodeOf<K>; anchor: AnchorFn }>;
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
};

export interface RenderOptions {
  /**
   * Emit `data-glyph-line` / `data-glyph-line-end` attributes tying each
   * rendered element back to the source lines it came from (see
   * `./source-anchors`).
   *
   * Off by default, and deliberately so: provenance is an *editor* concern —
   * the IntelliJ plugin's preview uses it to keep scrolling in step with the
   * source. A document written to disk by the CLI, or handed to Chromium for
   * `renderToPdf`, has no editor to sync with and no reason to carry it.
   */
  sourceAnchors?: boolean;
}

export function renderToHtml(
  doc: GlyphDocument,
  options: RenderOptions = {},
): string {
  const cache = createCache({ key: 'gm' });
  const { extractCriticalToChunks, constructStyleTagsFromChunks } =
    createEmotionServer(cache);

  // Threaded down as an explicit, *required* prop rather than through React
  // context: this library has no other hooks in it, and an ambient dependency
  // that silently renders nothing when unprovided is a harder bug to see than
  // one the compiler refuses. Switching anchors off is this one substitution,
  // not an absent prop — so every component below stays unaware of the option.
  const anchor = options.sourceAnchors
    ? createAnchorFn(doc.tokenMap)
    : NO_ANCHORS;

  const body = renderToString(
    <CacheProvider value={cache}>
      <Body doc={doc} anchor={anchor} />
    </CacheProvider>,
  );

  const styleTags = constructStyleTagsFromChunks(extractCriticalToChunks(body));

  const pageChrome = renderPageShadowTags();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${FONT_CSS}</style>${styleTags}${pageChrome}</head><body>${body}<script>${PAGEDJS_POLYFILL}</script></body></html>`;
}

function Body({ doc, anchor }: { doc: GlyphDocument; anchor: AnchorFn }) {
  return (
    <Document>
      <FullWidthStyles body={doc.body} />
      {doc.body.map((node, index) => {
        const Comp = RENDERERS[node.type] as
          | FC<{ node: BodyNode; anchor: AnchorFn }>
          | undefined;
        return Comp ? <Comp key={index} node={node} anchor={anchor} /> : null;
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
