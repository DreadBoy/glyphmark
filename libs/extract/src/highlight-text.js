#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename, extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const DEFAULT_SCALE = 2;

export async function renderHighlightHtml(
  sourcePath,
  page,
  scale = DEFAULT_SCALE,
) {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('page must be a positive 1-based integer');
  }

  const data = new Uint8Array(await readFile(sourcePath));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;

  if (page > doc.numPages) {
    throw new Error(
      `page ${page} is out of range (source has ${doc.numPages} pages, 1-indexed)`,
    );
  }

  const pdfPage = await doc.getPage(page);
  const viewport = pdfPage.getViewport({ scale });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
  const png = await canvas.encode('png');

  const boxes = await extractBoxes(pdfPage, viewport, width, height);
  // Synthetic page-sized box; goes first so it sits behind everything in
  // the DOM and only catches pointer events in empty page area.
  boxes.unshift({ kind: 'page', x: 0, y: 0, w: width, h: height, s: 'page' });

  await doc.cleanup();
  await doc.destroy();

  return renderHtml({ png, boxes, width, height, sourcePath, page, scale });
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Collect selectable boxes for a page: every text run, every painted
 * path (fill or stroke), and every painted image. Path/image boxes are
 * derived by walking the operator list with a CTM stack and applying
 * the composed (viewport ⋅ CTM) transform to the path's pre-computed
 * minMax AABB.
 */
async function extractBoxes(pdfPage, viewport, pageW, pageH) {
  const boxes = [];

  // Text boxes (per text item from the content stream).
  // text.styles maps each item.fontName alias to a generic family
  // (sans-serif/serif). The real PostScript name (e.g. "GoodOT-Bold")
  // lives in pdfPage.commonObjs, populated during render() above. Many
  // embedded fonts also carry a 6-letter subset prefix like "AAAAAA+";
  // strip it for a readable label.
  const text = await pdfPage.getTextContent();
  const fontNameCache = new Map();
  const lookupFont = (alias) => {
    if (!alias) return null;
    if (fontNameCache.has(alias)) return fontNameCache.get(alias);
    let name = null;
    try {
      name = pdfPage.commonObjs.get(alias)?.name ?? null;
    } catch {
      // commonObjs throws if the font isn't loaded yet — leave null.
    }
    if (name) name = name.replace(/^[A-Z]{6}\+/, '');
    fontNameCache.set(alias, name);
    return name;
  };
  for (const item of text.items) {
    if (!item.str || !item.transform) continue;
    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const h = Math.hypot(tx[2], tx[3]);
    const w = item.width * (viewport.scale ?? 1);
    if (w <= 0 || h <= 0) continue;
    boxes.push({
      kind: 'text',
      x: round(tx[4]),
      y: round(tx[5] - h),
      w: round(w),
      h: round(h),
      font: lookupFont(item.fontName),
      s: item.str,
    });
  }

  // Path and image boxes (painted shapes / pictures).
  const list = await pdfPage.getOperatorList();
  const OPS = pdfjs.OPS;
  // PAINT_OPS: codes that, when used as the first arg of constructPath,
  // mean "fill or stroke this path" (vs endPath, which is for clipping).
  const PAINT_OPS = new Set([
    OPS.fill,
    OPS.stroke,
    OPS.fillStroke,
    OPS.eoFill,
    OPS.eoFillStroke,
    OPS.closeStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);

  // CTM stack. The top of the stack is the active CTM. PDF spec says
  // `cm a b c d e f` post-multiplies: newCTM = oldCTM ⋅ args. pdf.js's
  // Util.transform(m1, m2) returns m1 ⋅ m2, so we use it directly.
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) {
      stack.push(ctm);
    } else if (fn === OPS.restore) {
      if (stack.length > 0) ctm = stack.pop();
    } else if (fn === OPS.transform) {
      ctm = pdfjs.Util.transform(ctm, args);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      // args[0] is the form's matrix; args[1] is its bbox (we don't need
      // it here — clipping is handled by pdf.js's renderer, not by us).
      if (args && args[0]) ctm = pdfjs.Util.transform(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) {
      if (stack.length > 0) ctm = stack.pop();
    } else if (fn === OPS.constructPath) {
      // args is [paintOp | paintOps[], points, minMax]. paintOp 28 is
      // endPath (used for clipping setup) — skip those.
      const paint = args[0];
      const isPainted = Array.isArray(paint)
        ? paint.some((p) => PAINT_OPS.has(p))
        : PAINT_OPS.has(paint);
      if (!isPainted) continue;
      const minMax = args[2];
      if (!minMax || minMax.length < 4) continue;
      const rect = transformBBox(minMax, ctm, viewport.transform);
      if (!rect) continue;
      const clipped = clipToPage(rect, pageW, pageH);
      if (!clipped) continue;
      boxes.push({ kind: 'path', ...clipped });
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintJpegXObject
    ) {
      // PDF images are drawn at the unit square [0,0]..[1,1] in user
      // space; the CTM scales them to their target rect.
      const rect = transformBBox([0, 0, 1, 1], ctm, viewport.transform);
      if (!rect) continue;
      const clipped = clipToPage(rect, pageW, pageH);
      if (!clipped) continue;
      boxes.push({
        kind: 'image',
        ...clipped,
        s: typeof args?.[0] === 'string' ? args[0] : 'image',
      });
    }
  }

  // De-dupe near-identical boxes — paths often get drawn twice (fill +
  // stroke) producing two virtually identical entries.
  const deduped = dedupeBoxes(boxes);
  // Sort by area descending so smaller boxes land later in the DOM and
  // receive hover preferentially when nested inside larger ones (e.g.
  // a text label inside a colored header rectangle).
  deduped.sort((a, b) => b.w * b.h - a.w * a.h);
  return deduped;
}

function transformBBox(minMax, ctm, viewportTx) {
  const combined = pdfjs.Util.transform(viewportTx, ctm);
  const [x0, y0, x1, y1] = minMax;
  const corners = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  // applyTransform mutates the point in place and returns undefined.
  for (const c of corners) pdfjs.Util.applyTransform(c, combined);
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < 1 || h < 1) return null;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function clipToPage(rect, pageW, pageH) {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const right = Math.min(pageW, rect.x + rect.w);
  const bottom = Math.min(pageH, rect.y + rect.h);
  const w = right - x;
  const h = bottom - y;
  if (w < 1 || h < 1) return null;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

function dedupeBoxes(boxes) {
  const out = [];
  const seen = new Set();
  for (const b of boxes) {
    const key = `${b.kind}|${Math.round(b.x)}|${Math.round(b.y)}|${Math.round(b.w)}|${Math.round(b.h)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function renderHtml({ png, boxes, width, height, sourcePath, page, scale }) {
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  const title = `${basename(sourcePath)} — page ${page}`;
  // Box data is injected as JSON. The viewer JS owns all interaction.
  const json = JSON.stringify(boxes);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; }
    html, body { margin: 0; background: #1b1b1b; color: #ddd; font: 12px ui-sans-serif, system-ui, -apple-system, sans-serif; }
    .help {
      position: fixed; top: 10px; left: 10px; z-index: 100;
      background: #000c; padding: 6px 9px; border-radius: 4px;
      line-height: 1.5; pointer-events: none;
    }
    .help kbd { background: #333; border-radius: 2px; padding: 0 4px; font-family: ui-monospace, monospace; }
    .stage { position: relative; display: inline-block; margin: 24px; line-height: 0; }
    .stage img { display: block; width: ${width}px; height: ${height}px; user-select: none; -webkit-user-drag: none; }
    .box {
      position: absolute; box-sizing: border-box;
      border: 1px solid transparent; background: transparent;
      cursor: crosshair;
    }
    .box:hover { border-color: rgba(220, 0, 0, 0.9); background: rgba(220, 0, 0, 0.10); }
    .box.anchor { border-color: rgba(60, 150, 255, 0.95); background: rgba(60, 150, 255, 0.18); }
    .box.page:hover { border-color: rgba(220, 0, 0, 0.5); background: transparent; }
    .box.page.anchor { border-color: rgba(60, 150, 255, 0.7); background: transparent; }
    .overlay { position: absolute; inset: 0; pointer-events: none; }
    .label {
      position: absolute; background: #111e; color: #fff; padding: 2px 5px;
      font-size: 11px; line-height: 1.2; border-radius: 2px; white-space: nowrap;
      transform: translate(-50%, -100%); font-family: ui-monospace, monospace;
    }
    .label.size { background: rgba(220, 0, 0, 0.95); }
    .label.gap { background: rgba(60, 150, 255, 0.95); }
    .guide { position: absolute; background: rgba(60, 150, 255, 0.95); }
    .guide.h { height: 1px; transform: translateY(-0.5px); }
    .guide.v { width: 1px; transform: translateX(-0.5px); }
    .tick { position: absolute; background: rgba(60, 150, 255, 0.95); }
    .tick.h { width: 1px; height: 6px; transform: translate(-0.5px, -3px); }
    .tick.v { height: 1px; width: 6px; transform: translate(-3px, -0.5px); }
  </style>
</head>
<body>
  <div class="help">
    hover: size · click: anchor · hover another: gap · <kbd>Esc</kbd>: clear
  </div>
  <div class="stage" id="stage">
    <img src="${dataUrl}" alt="">
    <div class="overlay" id="overlay"></div>
  </div>
  <script>
    const BOXES = ${json};
    const SCALE = ${scale};
    const stage = document.getElementById('stage');
    const overlay = document.getElementById('overlay');
    let anchor = null;
    let hover = null;

    BOXES.forEach((b, i) => {
      const el = document.createElement('div');
      el.className = 'box' + (b.kind === 'page' ? ' page' : '');
      el.style.left = b.x + 'px';
      el.style.top = b.y + 'px';
      el.style.width = b.w + 'px';
      el.style.height = b.h + 'px';
      el.title = b.kind === 'text' && b.font
        ? '"' + b.s + '" — ' + b.font
        : b.s;
      el.dataset.i = i;
      el.addEventListener('mouseenter', () => { hover = b; draw(); });
      el.addEventListener('mouseleave', () => { hover = null; draw(); });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const prev = anchor;
        clearAnchor();
        if (!prev || prev.i !== i) {
          anchor = { i, b };
          el.classList.add('anchor');
        }
        draw();
      });
      stage.appendChild(el);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { clearAnchor(); draw(); }
    });
    document.addEventListener('click', () => { clearAnchor(); draw(); });

    function clearAnchor() {
      if (anchor) {
        const el = stage.querySelector('.box[data-i="' + anchor.i + '"]');
        if (el) el.classList.remove('anchor');
      }
      anchor = null;
    }

    function draw() {
      overlay.innerHTML = '';
      if (hover) {
        const parts = [];
        if (hover.kind === 'text' && hover.font) parts.push(hover.font);
        parts.push(fmt(hover.w) + ' × ' + fmt(hover.h));
        addLabel(hover.x + hover.w / 2, hover.y - 4, parts.join(' · '), 'size');
      }
      if (anchor && hover && anchor.i !== BOXES.indexOf(hover)) {
        drawGap(anchor.b, hover);
      }
    }

    function drawGap(a, b) {
      // Containment: one rect fully inside the other → show 4 edge insets.
      const inner = contains(a, b) ? b : contains(b, a) ? a : null;
      if (inner) {
        const outer = inner === a ? b : a;
        drawInsets(outer, inner);
        return;
      }
      // Horizontal gap: empty space between right of left-rect and left of right-rect.
      const hLeft = a.x + a.w <= b.x;
      const hRight = b.x + b.w <= a.x;
      if (hLeft || hRight) {
        const x1 = hLeft ? a.x + a.w : b.x + b.w;
        const x2 = hLeft ? b.x : a.x;
        // Run the guide at the vertical center of the overlap (or midway if disjoint).
        const yA = [a.y, a.y + a.h], yB = [b.y, b.y + b.h];
        const overlap = Math.max(yA[0], yB[0]) <= Math.min(yA[1], yB[1]);
        const y = overlap
          ? (Math.max(yA[0], yB[0]) + Math.min(yA[1], yB[1])) / 2
          : (yA[0] + yA[1] + yB[0] + yB[1]) / 4;
        addGuide('h', x1, y, x2 - x1);
        addTick('h', x1, y);
        addTick('h', x2, y);
        addLabel((x1 + x2) / 2, y - 4, fmt(x2 - x1), 'gap');
      }
      // Vertical gap.
      const vUp = a.y + a.h <= b.y;
      const vDown = b.y + b.h <= a.y;
      if (vUp || vDown) {
        const y1 = vUp ? a.y + a.h : b.y + b.h;
        const y2 = vUp ? b.y : a.y;
        const xA = [a.x, a.x + a.w], xB = [b.x, b.x + b.w];
        const overlap = Math.max(xA[0], xB[0]) <= Math.min(xA[1], xB[1]);
        const x = overlap
          ? (Math.max(xA[0], xB[0]) + Math.min(xA[1], xB[1])) / 2
          : (xA[0] + xA[1] + xB[0] + xB[1]) / 4;
        addGuide('v', x, y1, y2 - y1);
        addTick('v', x, y1);
        addTick('v', x, y2);
        addLabel(x, (y1 + y2) / 2, fmt(y2 - y1), 'gap');
      }
    }

    function round(n) { return Math.round(n * 10) / 10; }
    function fmt(n) { return round(n / SCALE) + ' pt'; }

    function contains(outer, inner) {
      return outer.x <= inner.x
        && outer.y <= inner.y
        && outer.x + outer.w >= inner.x + inner.w
        && outer.y + outer.h >= inner.y + inner.h;
    }

    function drawInsets(outer, inner) {
      const left = inner.x - outer.x;
      const right = (outer.x + outer.w) - (inner.x + inner.w);
      const top = inner.y - outer.y;
      const bottom = (outer.y + outer.h) - (inner.y + inner.h);
      const yMid = inner.y + inner.h / 2;
      const xMid = inner.x + inner.w / 2;
      if (left > 0) {
        addGuide('h', outer.x, yMid, left);
        addTick('h', outer.x, yMid);
        addTick('h', inner.x, yMid);
        addLabel(outer.x + left / 2, yMid - 4, fmt(left), 'gap');
      }
      if (right > 0) {
        addGuide('h', inner.x + inner.w, yMid, right);
        addTick('h', inner.x + inner.w, yMid);
        addTick('h', outer.x + outer.w, yMid);
        addLabel(inner.x + inner.w + right / 2, yMid - 4, fmt(right), 'gap');
      }
      if (top > 0) {
        addGuide('v', xMid, outer.y, top);
        addTick('v', xMid, outer.y);
        addTick('v', xMid, inner.y);
        addLabel(xMid, outer.y + top / 2, fmt(top), 'gap');
      }
      if (bottom > 0) {
        addGuide('v', xMid, inner.y + inner.h, bottom);
        addTick('v', xMid, inner.y + inner.h);
        addTick('v', xMid, outer.y + outer.h);
        addLabel(xMid, inner.y + inner.h + bottom / 2, fmt(bottom), 'gap');
      }
    }

    function addLabel(x, y, text, kind) {
      const el = document.createElement('div');
      el.className = 'label ' + (kind || '');
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.textContent = text;
      overlay.appendChild(el);
    }

    function addGuide(dir, x, y, len) {
      const el = document.createElement('div');
      el.className = 'guide ' + dir;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      if (dir === 'h') el.style.width = Math.abs(len) + 'px';
      else el.style.height = Math.abs(len) + 'px';
      overlay.appendChild(el);
    }

    function addTick(dir, x, y) {
      const el = document.createElement('div');
      el.className = 'tick ' + dir;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      overlay.appendChild(el);
    }
  </script>
</body>
</html>
`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;',
  );
}

function usage() {
  console.error(
    'usage: highlight-text --source <pdf> --page <n> [--out <html>] [--scale <s>]',
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = { source: null, page: null, out: null, scale: DEFAULT_SCALE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--source' || a === '-s') args.source = argv[++i];
    else if (a === '--page' || a === '-p') args.page = argv[++i];
    else if (a === '--out' || a === '-o') args.out = argv[++i];
    else if (a === '--scale') args.scale = argv[++i];
    else if (a === '--help' || a === '-h') usage();
    else {
      console.error(`unknown argument: ${a}`);
      usage();
    }
  }
  if (!args.source || args.page === null) usage();

  const n = Number(args.page);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`invalid page number: ${args.page}`);
    usage();
  }
  args.page = n;

  const s = Number(args.scale);
  if (!Number.isFinite(s) || s <= 0) {
    console.error(`invalid scale: ${args.scale}`);
    usage();
  }
  args.scale = s;
  return args;
}

async function main() {
  const { source, page, out, scale } = parseArgs(process.argv.slice(2));
  const sourcePath = resolve(source);
  const html = await renderHighlightHtml(sourcePath, page, scale);

  const outPath = out
    ? resolve(out)
    : join(
        dirname(sourcePath),
        `${basename(sourcePath, extname(sourcePath))}-p${page}-textboxes.html`,
      );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html);
  console.log(outPath);
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
