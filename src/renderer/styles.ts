import { FONT_CSS } from "../vendor/font-css.js";
import { SCRIBE_LAYOUT_CSS } from "../vendor/scribe-layout-css.js";
import { SCRIBE_THEME_CSS } from "../vendor/scribe-theme-css.js";

// Combined CSS for scribe-compatible output
export function getScribeCSS(options?: {
  googleFonts?: string[];
  pageNumbers?: boolean;
  customCss?: string;
}): string {
  const parts: string[] = [];

  // Google Fonts imports (from fonts() block)
  if (options?.googleFonts) {
    for (const spec of options.googleFonts) {
      parts.push(`@import url('https://fonts.googleapis.com/css2?family=${spec}&display=swap');`);
    }
  }

  parts.push(FONT_CSS);
  parts.push(SCRIBE_LAYOUT_CSS);
  parts.push(SCRIBE_THEME_CSS);

  // Page numbers
  if (options?.pageNumbers) {
    parts.push(`
.page::after {
    counter-increment: pages;
    content: counter(pages);
}`);
  }

  // Custom CSS from css() blocks
  if (options?.customCss) {
    parts.push(options.customCss);
  }

  return parts.join("\n\n");
}

// Backward compat - removed in Phase 3 renderer rewrite
export const PF2E_CSS = "";
export const SCRIBE_LAYOUT_CSS_COMPAT = "";
