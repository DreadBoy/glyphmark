import { PF2E_CSS } from "./styles.js";
import type { DocumentMeta } from "../ir/types.js";

export function wrapHtml(
  content: string,
  meta: DocumentMeta,
  opts?: { devScript?: string },
): string {
  const title = meta.title ? escapeAttr(meta.title) : "Glyphmark Document";
  const watermarkHtml = meta.watermark
    ? `<div class="pf2e-watermark">${escapeHtml(meta.watermark)}</div>`
    : "";

  const watermarkCss = meta.watermark
    ? `
.pf2e-watermark {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  font-size: 6em;
  color: rgba(0, 0, 0, 0.04);
  pointer-events: none;
  white-space: nowrap;
  font-family: var(--pf2e-header-font);
  z-index: -1;
}`
    : "";

  const devScript = opts?.devScript ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${PF2E_CSS}${watermarkCss}</style>
</head>
<body>
${watermarkHtml}
${content}
${devScript}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
