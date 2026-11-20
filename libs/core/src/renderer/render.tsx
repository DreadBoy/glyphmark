import { renderToString } from 'react-dom/server';
import type { FC } from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import createEmotionServer from '@emotion/server/create-instance';
import type { GlyphDocument, BodyNode, SidebarBlockNode } from '../parser';
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
  SIDEBAR_PAGE_HANDLER,
  SidebarBlock,
  SidebarRail,
} from '../components/sidebar-block';
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

  // The sidebar page handler must be registered after the polyfill defines
  // `window.Paged` but before it starts paginating (it waits for the document
  // to be ready, so a following inline script is in time).
  const hasSidebar = doc.body.some((node) => node.type === 'sidebar');
  const handlers = hasSidebar ? `<script>${SIDEBAR_PAGE_HANDLER}</script>` : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${FONT_CSS}</style>${styleTags}${pageChrome}</head><body>${body}<script>${PAGEDJS_POLYFILL}</script>${handlers}</body></html>`;
}

function Body({ doc, anchor }: { doc: GlyphDocument; anchor: AnchorFn }) {
  return (
    <Document>
      <FullWidthStyles body={doc.body} />
      {groupSidebars(doc.body).map((item, index) => {
        if (Array.isArray(item)) {
          return (
            <SidebarGroup
              key={index}
              nodes={item}
              atPageStart={index === 0 || isPageBreak(doc, item[0])}
              anchor={anchor}
            />
          );
        }
        const Comp = RENDERERS[item.type] as
          | FC<{ node: BodyNode; anchor: AnchorFn }>
          | undefined;
        return Comp ? <Comp key={index} node={item} anchor={anchor} /> : null;
      })}
    </Document>
  );
}

// Runs of consecutive sidebar() blocks collapse into one array so they share a
// single rail; every other node passes through unchanged.
function groupSidebars(body: BodyNode[]): (BodyNode | SidebarBlockNode[])[] {
  const out: (BodyNode | SidebarBlockNode[])[] = [];
  for (const node of body) {
    const last = out[out.length - 1];
    if (node.type !== 'sidebar') out.push(node);
    else if (Array.isArray(last)) last.push(node);
    else out.push([node]);
  }
  return out;
}

// Whether the node right before `first` in the body is an explicit `=`.
function isPageBreak(doc: GlyphDocument, first: SidebarBlockNode): boolean {
  const i = doc.body.indexOf(first);
  return i > 0 && doc.body[i - 1].type === 'page-break';
}

// A sidebar page always starts with its rail: the rail is what switches the
// page to the sidebar geometry, so it must come before any main text on that
// page. When the source doesn't open the page with `=` (or the document
// start), break the page implicitly.
function SidebarGroup({
  nodes,
  atPageStart,
  anchor,
}: {
  nodes: SidebarBlockNode[];
  atPageStart: boolean;
  anchor: AnchorFn;
}) {
  return (
    <>
      {!atPageStart && <PageBreak />}
      <SidebarRail>
        {nodes.map((node, index) => (
          <SidebarBlock key={index} node={node} anchor={anchor} />
        ))}
      </SidebarRail>
    </>
  );
}

// Global that `renderToPdf`'s injected PagedConfig sets once paged.js is done.
const PAGED_DONE = '__glyphmarkPaged';

// PDF rendering reuses the HTML output and lets Chromium paginate it. We
// import Playwright lazily (via a dynamic import) so consumers that only
// need `renderToHtml` don't pay the cost of loading Playwright at module
// init — and so the import doesn't run in browser-side consumers of the
// library at all.
export async function renderToPdf(doc: GlyphDocument): Promise<Buffer> {
  // paged.js reads `window.PagedConfig` once, when the polyfill initialises,
  // and calls `after` only once the whole document has been laid out. Waiting
  // for `.pagedjs_pages` is not enough: that container appears with the first
  // page, and printing then cuts the PDF off wherever pagination has got to
  // (#33). The config goes at the top of <head>, ahead of the polyfill script.
  // (`page.addInitScript` would be neater, but `setContent` doesn't run it.)
  const html = renderToHtml(doc).replace(
    '<head>',
    `<head><script>window.PagedConfig = { after: () => { window.${PAGED_DONE} = true; } };</script>`,
  );
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1 });
    const page = await context.newPage();
    // A paged.js failure would otherwise leave `after` uncalled, and the wait
    // below would hang instead of reporting it.
    const pageError = new Promise<never>((_, reject) => {
      page.on('pageerror', (error) =>
        reject(new Error(`Pagination failed: ${error.message}`)),
      );
    });
    // Once the race below settles nobody awaits this, and a late error would
    // surface as an unhandled rejection.
    pageError.catch(() => undefined);
    // Print media first so screen-only chrome (page shadows) is excluded
    // before paged.js paginates against the print stylesheet.
    await page.emulateMedia({ media: 'print' });
    await page.setContent(html, { waitUntil: 'networkidle' });
    // No timeout: pagination time grows with the document, and a book of
    // tens of thousands of lines legitimately takes minutes.
    await Promise.race([
      page.waitForFunction(
        (flag) => (globalThis as Record<string, unknown>)[flag],
        PAGED_DONE,
        { timeout: 0, polling: 100 },
      ),
      pageError,
    ]);
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
