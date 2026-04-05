import { FONT_CSS } from "../vendor/font-css.js";
import { GLYPHMARK_CSS } from "../styles/glyphmark-css.js";

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
  parts.push(GLYPHMARK_CSS);

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
