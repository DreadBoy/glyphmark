import { Global, type CSSObject } from '@emotion/react';
import type { PropsWithChildren } from 'react';
import type { SidebarBlockNode, SidebarSegment } from '../parser';
import { pt } from './size-helper';
import { COLUMN_GAP, DOCUMENT_CLASS } from './document';
import { renderInlines } from './inline';
import type { AnchorFn } from '../renderer/source-anchors';
import { SANS } from '../vendor/font-css';

// The rulebooks' margin/aside lore callouts — e.g. Monster Core's genie
// "SHUYOOKHS" notes or the stat rail of a Player Core ancestry. A true
// sidebar: a narrow, full-height rail set against the page's outer edge,
// separated from the main text by a keyline, with the whole callout in deep
// maroon ink (an ALL-CAPS bold sans title over short sans-serif prose). No
// box/fill — colour is what sets it apart from the black body text.
//
// Layout model: the body stays ONE flow that paged.js paginates. The rail is
// an ordinary node in that flow; when paged.js lays it onto a page, the
// SIDEBAR_PAGE_HANDLER script below tags that page with `gm-sidebar-page`.
// The page CSS then turns that page's fragment of the document into a single
// column with a strip reserved on the outer edge, and the rail is positioned
// absolutely into that strip. Everything laid out after the rail on that page
// is measured against the narrowed geometry, so overflow flows naturally onto
// the next (ordinary two-column) page.
const INK = '#481808'; // measured from the source book's sidebar text
const KEYLINE = '#191000';
const RAIL_WIDTH = 120; // pt — narrower than a main text column
const RAIL_PADDING = 10; // pt — keyline to rail text

// Class paged.js-side code adds to a page that carries a sidebar rail.
const SIDEBAR_PAGE = 'gm-sidebar-page';
const RAIL_CLASS = 'gm-sidebar-rail';
// paged.js marks every laid-out page as left/right (first page is recto). The
// screen preview and the PDF are both that same paged DOM, so keying the mirror
// off this class covers both views.
export const VERSO = '.pagedjs_left_page';

// paged.js handler: tag the page a rail lands on. `renderNode` fires right
// after the node is appended to the page, before anything after it is laid
// out, so the geometry change applies to the rest of that page. Injected after
// the polyfill (which starts paginating only once the document is ready), and
// only for documents that contain a sidebar.
export const SIDEBAR_PAGE_HANDLER = `(function(){
  if (!window.Paged) return;
  class GlyphSidebarPages extends Paged.Handler {
    renderNode(clone) {
      if (clone.nodeType !== 1 || !clone.classList.contains('${RAIL_CLASS}')) return;
      var page = clone.closest('.pagedjs_page');
      if (page) page.classList.add('${SIDEBAR_PAGE}');
    }
  }
  Paged.registerHandlers(GlyphSidebarPages);
})();`;

function SidebarPageStyles() {
  const reserve = pt(RAIL_WIDTH + COLUMN_GAP).toRem();
  return (
    <Global
      styles={{
        [`.${SIDEBAR_PAGE} .${DOCUMENT_CLASS}`]: {
          columnCount: 1,
          paddingRight: reserve,
        },
        [`.${SIDEBAR_PAGE}${VERSO} .${DOCUMENT_CLASS}`]: {
          paddingRight: 0,
          paddingLeft: reserve,
        },
      }}
    />
  );
}

// One rail per run of consecutive sidebar() blocks; they stack inside it.
export function SidebarRail({ children }: PropsWithChildren) {
  const keyline = `${pt(0.75).toRem()} solid ${KEYLINE}`;
  return (
    <div
      className={RAIL_CLASS}
      css={{
        // Positioned against .pagedjs_page_content (position: relative), so
        // the rail spans the full content height of its page.
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        width: pt(RAIL_WIDTH).toRem(),
        color: INK,
        // Recto: rail on the right, keyline on its spine-ward (left) side.
        paddingLeft: pt(RAIL_PADDING).toRem(),
        borderLeft: keyline,
        // Verso: mirrored — rail on the left, keyline on its right, and the
        // text set flush against the keyline (ragged toward the outer edge).
        [`${VERSO} &`]: {
          right: 'auto',
          left: 0,
          paddingLeft: 0,
          borderLeft: 'none',
          paddingRight: pt(RAIL_PADDING).toRem(),
          borderRight: keyline,
          textAlign: 'right',
        },
      }}
    >
      <SidebarPageStyles />
      {children}
    </div>
  );
}

export function SidebarBlock({
  node,
  anchor,
}: {
  node: SidebarBlockNode;
  anchor: AnchorFn;
}) {
  return (
    <div
      className="gm-sidebar"
      {...anchor(node.origin)}
      css={{ '& + &': { marginTop: pt(14).toRem() } }}
    >
      {node.content.map((segment, i) => (
        <Segment
          key={i}
          segment={segment}
          prevKind={node.content[i - 1]?.kind}
        />
      ))}
    </div>
  );
}

const PARA_BASE: CSSObject = {
  margin: 0,
  fontFamily: SANS,
  fontSize: pt(8).toRem(),
  lineHeight: pt(11).toRem(),
};

// Top margin for a segment: a section break above headings, tight under a
// heading, a small gap between sibling paragraphs. First segment sits flush.
function topMargin(kind: SidebarSegment['kind'], prevKind?: string): string {
  if (prevKind === undefined) return '0';
  if (kind === 'heading') return pt(9).toRem();
  return prevKind === 'heading' ? pt(2).toRem() : pt(4).toRem();
}

function Segment({
  segment,
  prevKind,
}: {
  segment: SidebarSegment;
  prevKind?: string;
}) {
  const marginTop = topMargin(segment.kind, prevKind);

  if (segment.kind === 'heading') {
    // Both h1 and h2 are ALL-CAPS bold sans titles; h2 is a touch smaller for
    // stacked sub-sections within one callout.
    return (
      <p
        css={{
          fontFamily: SANS,
          fontWeight: 700,
          textTransform: 'uppercase',
          fontSize: segment.level === 1 ? pt(10).toRem() : pt(9).toRem(),
          lineHeight: pt(12).toRem(),
          margin: 0,
          marginTop,
        }}
      >
        {renderInlines(segment.content)}
      </p>
    );
  }

  if (segment.kind === 'paragraph') {
    // Flush prose — no first-line indent (the lore boxes set their body flush).
    return (
      <p css={{ ...PARA_BASE, marginTop }}>{renderInlines(segment.content)}</p>
    );
  }

  return null;
}
