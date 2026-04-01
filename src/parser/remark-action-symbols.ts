import type { Plugin } from "unified";
import type { Root, Text, PhrasingContent } from "mdast";
import { visit } from "unist-util-visit";

// Action symbol SVGs (simple geometric shapes)
const ACTION_SVGS: Record<string, string> = {
  ":aaa:": `<span class="pf2e-action" title="Three Actions"><svg viewBox="0 0 36 12" width="54" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/><polygon points="27,6 30,1 33,6 30,11" fill="currentColor"/></svg></span>`,
  ":aa:": `<span class="pf2e-action" title="Two Actions"><svg viewBox="0 0 24 12" width="36" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/><polygon points="15,6 18,1 21,6 18,11" fill="currentColor"/></svg></span>`,
  ":a:": `<span class="pf2e-action" title="Single Action"><svg viewBox="0 0 12 12" width="18" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="currentColor"/></svg></span>`,
  ":r:": `<span class="pf2e-action" title="Reaction"><svg viewBox="0 0 12 12" width="18" height="18"><path d="M9,6 L5,2 L5,5 L3,5 L3,7 L5,7 L5,10 Z" fill="currentColor"/></svg></span>`,
  ":f:": `<span class="pf2e-action" title="Free Action"><svg viewBox="0 0 12 12" width="18" height="18"><polygon points="3,6 6,1 9,6 6,11" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></span>`,
};

// Order matters: check :aaa: before :aa: before :a:
const SYMBOL_PATTERN = /:aaa:|:aa:|:a:|:r:|:f:/g;

/**
 * Remark plugin that replaces action symbol text (:a:, :aa:, etc.)
 * with inline HTML spans containing SVG icons.
 * Runs globally on all text nodes.
 */
const remarkActionSymbols: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (index === undefined || !parent) return;
      if (!SYMBOL_PATTERN.test(node.value)) return;

      SYMBOL_PATTERN.lastIndex = 0;

      const children: PhrasingContent[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = SYMBOL_PATTERN.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          children.push({
            type: "text",
            value: node.value.slice(lastIndex, match.index),
          });
        }
        const svg = ACTION_SVGS[match[0]];
        if (svg) {
          children.push({
            type: "html",
            value: svg,
          });
        }
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < node.value.length) {
        children.push({
          type: "text",
          value: node.value.slice(lastIndex),
        });
      }

      if (children.length > 0) {
        parent.children.splice(index, 1, ...children as never[]);
        return index + children.length;
      }
    });
  };
};

export default remarkActionSymbols;
