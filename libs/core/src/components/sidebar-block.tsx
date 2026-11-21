import { Global, type CSSObject } from '@emotion/react';
import type { PropsWithChildren } from 'react';
import type { SidebarBlockNode, SidebarSegment } from '../parser';
import { pt } from './size-helper';
import { COLUMN_GAP, DOCUMENT_CLASS, MARGIN } from './document';
import { HEAD_ANCHOR, HEAD_CLASS, HEAD_GAP } from './head-block';
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
// Layout model: the body stays ONE flow that paged.js paginates, but the rail
// is not part of it. Before pagination, SIDEBAR_PAGE_HANDLER (below) swaps each
// rail for an empty marker. When paged.js lays the marker onto a page, the
// handler tags that page with `gm-sidebar-page` and attaches the rail to it.
// The page CSS then turns that page's fragment of the document into a single
// column with a strip reserved on the outer edge, and the rail is positioned
// absolutely into that strip. Everything laid out after the marker on that
// page is measured against the narrowed geometry, so overflow flows naturally
// onto the next (ordinary two-column) page.
//
// A rail taller than its page is cut after its last whole line that fits, and
// the rest continues in the rail strip of the next page, next to that page's
// body text (#39). Were the rail in the flow, paged.js would break the flow
// inside it instead: pages holding nothing but rail, then the tail of the rail
// on a page that isn't a sidebar page, printed over its body text.
const INK = '#481808'; // measured from the source book's sidebar text
const KEYLINE = '#191000';
const RAIL_WIDTH = 120; // pt — narrower than a main text column
const RAIL_PADDING = 10; // pt — keyline to rail text

// Class paged.js-side code adds to a page that carries a sidebar rail.
const SIDEBAR_PAGE = 'gm-sidebar-page';
const RAIL_CLASS = 'gm-sidebar-rail';
// The empty node that holds a rail's place in the flow.
const MARK_CLASS = 'gm-sidebar-mark';
// Sidebar headings stay with the text under them when a rail is cut.
const HEADING_CLASS = 'gm-sidebar-heading';
// paged.js marks every laid-out page as left/right (first page is recto). The
// screen preview and the PDF are both that same paged DOM, so keying the mirror
// off this class covers both views.
export const VERSO = '.pagedjs_left_page';

// paged.js handler that lays rails out beside the flow. Injected after the
// polyfill (which starts paginating only once the document is ready), and only
// for documents that contain a sidebar. Hooks, in the order they fire:
//
// - beforeParsed: take every rail out of the content, leaving a marker.
// - beforePageLayout: a rail cut on the previous page continues on this one.
//   The page is tagged before any of its body is laid out.
// - renderNode: a marker was just laid onto a page. Tag the page and attach
//   (a copy of) its rail. Fires before anything after the marker is laid out,
//   so the geometry change applies to the rest of that page.
// - afterPageLayout: the page's body is in place, and with it any head() band
//   the rail starts below. Cut the rail where the page ends. If the document
//   ran out first, add pages until the rest of the rail is laid out.
export const SIDEBAR_PAGE_HANDLER = `(function(){
  if (!window.Paged) return;
  var RAIL = '${RAIL_CLASS}', MARK = '${MARK_CLASS}', PAGE = '${SIDEBAR_PAGE}', HEADING = '${HEADING_CLASS}';

  function railOf(pageEl) {
    var area = pageEl.querySelector('.pagedjs_page_content');
    return area && area.querySelector(':scope > .' + RAIL);
  }

  function attach(pageEl, rail) {
    var area = pageEl.querySelector('.pagedjs_page_content');
    if (!area) return;
    pageEl.classList.add(PAGE);
    var existing = railOf(pageEl);
    // A rail continued from the previous page, then a new one: stack them.
    if (existing) while (rail.firstChild) existing.appendChild(rail.firstChild);
    else area.appendChild(rail);
  }

  // The largest prefix of a text node whose lines all end above \`limit\`.
  function fittingPrefix(node, limit) {
    var range = document.createRange();
    var lo = 0, hi = node.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      range.setStart(node, 0);
      range.setEnd(node, mid);
      if (range.getBoundingClientRect().bottom <= limit) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Cut the rail after its last line that fits in its box, and return what
  // didn't fit as a new rail (or null if all of it fits).
  function split(rail) {
    if (rail.scrollHeight <= rail.clientHeight + 1) return null;
    var limit = rail.getBoundingClientRect().bottom;
    var walker = document.createTreeWalker(rail, NodeFilter.SHOW_TEXT);
    var range = document.createRange();
    var node, offset = -1;
    while ((node = walker.nextNode())) {
      if (!node.data.trim()) continue;
      range.selectNodeContents(node);
      if (range.getBoundingClientRect().bottom <= limit) continue;
      offset = fittingPrefix(node, limit);
      break;
    }
    if (offset < 0) return null;
    var cut = document.createRange();
    if (offset > 0) {
      cut.setStart(node, offset);
    } else {
      // The cut falls at the start of an element: move it before the
      // outermost element that starts here, and before a heading right
      // above it, so the heading isn't left alone at the foot of the rail.
      var n = node;
      for (;;) {
        while (n.parentNode !== rail && !n.previousSibling) n = n.parentNode;
        var prev = n.previousSibling;
        if (prev && prev.nodeType === 1 && prev.classList.contains(HEADING)) n = prev;
        else break;
      }
      // Not even the first line fits: leave it clipped rather than loop.
      if (n.parentNode === rail && !n.previousSibling) return null;
      cut.setStartBefore(n);
    }
    cut.setEnd(rail, rail.childNodes.length);
    var rest = rail.cloneNode(false);
    rest.appendChild(cut.extractContents());
    // The continuation sits flush with the top of its rail.
    for (var el = rest.firstElementChild; el; el = el.firstElementChild) {
      el.style.marginTop = '0';
    }
    return rest;
  }

  class GlyphSidebarPages extends Paged.Handler {
    constructor(chunker, polisher, caller) {
      super(chunker, polisher, caller);
      this.rails = [];
      this.pending = null;
      this.flushing = false;
    }

    beforeParsed(content) {
      this.rails = [];
      this.pending = null;
      var rails = content.querySelectorAll('.' + RAIL);
      for (var i = 0; i < rails.length; i++) {
        var mark = document.createElement('div');
        mark.className = MARK;
        mark.setAttribute('data-rail', String(i));
        rails[i].replaceWith(mark);
        this.rails.push(rails[i]);
      }
    }

    beforePageLayout(page) {
      if (!this.pending) return;
      var rest = this.pending;
      this.pending = null;
      attach(page.element, rest);
    }

    renderNode(clone) {
      if (clone.nodeType !== 1 || !clone.classList.contains(MARK)) return;
      var rail = this.rails[Number(clone.getAttribute('data-rail'))];
      var page = clone.closest('.pagedjs_page');
      // A copy, so a page paged.js lays out again still finds the whole rail.
      if (rail && page) attach(page, rail.cloneNode(true));
    }

    async afterPageLayout(pageEl, page, breakToken, chunker) {
      var rail = railOf(pageEl);
      if (!rail) return;
      // After the flow wrapper, so a head() band on this page can anchor it.
      rail.parentNode.appendChild(rail);
      this.pending = split(rail);
      // page.wrapper: this is a laid-out page, and the flow just ended on it.
      if (!this.pending || breakToken !== undefined || !page.wrapper || this.flushing) return;
      this.flushing = true;
      try {
        while (this.pending) {
          var extra = chunker.addPage();
          await chunker.hooks.beforePageLayout.trigger(extra, undefined, undefined, chunker);
          await chunker.hooks.afterPageLayout.trigger(extra.element, extra, undefined, chunker);
          await chunker.hooks.finalizePage.trigger(extra.element, extra, undefined, chunker);
        }
      } finally {
        this.flushing = false;
      }
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
        // A head() band on a sidebar page still spans the full page width
        // (the rail starts below it), so it bleeds across the reserved strip
        // as well as the page margin.
        [`.${SIDEBAR_PAGE} .${HEAD_CLASS}`]: {
          marginRight: `calc(${pt(-MARGIN).toRem()} - ${reserve})`,
        },
        [`.${SIDEBAR_PAGE}${VERSO} .${HEAD_CLASS}`]: {
          marginRight: pt(-MARGIN).toRem(),
          marginLeft: `calc(${pt(-MARGIN).toRem()} - ${reserve})`,
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
        // Attached straight to .pagedjs_page_content (position: relative),
        // beside the flow wrapper, so the rail runs down to the bottom of its page's content box. It
        // starts at the top, unless a head() band shares the page: then it
        // starts below the band, level with the text under it. anchor()
        // only resolves to a band inside the rail's own containing block,
        // i.e. on the same page; otherwise the fallback cancels the gap and
        // the rail sits at 0.
        position: 'absolute',
        top: `calc(anchor(${HEAD_ANCHOR} bottom, ${pt(-HEAD_GAP).toRem()}) + ${pt(HEAD_GAP).toRem()})`,
        bottom: 0,
        right: 0,
        width: pt(RAIL_WIDTH).toRem(),
        // Whatever doesn't fit is cut off and continued on the next page;
        // never let it spill over the page's body text.
        overflow: 'hidden',
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
      // Not '& + &': paged.js rewrites sibling selectors into attributes on
      // the flow content, and the rail is taken out of the flow before that.
      css={{ '&:not(:first-child)': { marginTop: pt(14).toRem() } }}
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
        className={HEADING_CLASS}
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
