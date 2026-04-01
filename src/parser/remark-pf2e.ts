import type { Plugin } from "unified";
import type { Root, Code, Html } from "mdast";
import { visit } from "unist-util-visit";
import { parsePf2eBlock, PF2E_LANGUAGES } from "./parse-yaml-block.js";
import { renderPf2eBlock } from "../renderer/render-block.js";

/**
 * Remark plugin that detects pf2e-* fenced code blocks,
 * parses their YAML content into IR objects, renders them
 * to HTML, and replaces the code blocks with raw HTML nodes.
 */
const remarkPf2e: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (!node.lang || !PF2E_LANGUAGES.includes(node.lang)) return;
      if (index === undefined || !parent) return;

      const block = parsePf2eBlock(node.lang, node.value);
      if (!block) return;

      const innerHtml = renderPf2eBlock(block);
      const html = `<div class="pf2e-block pf2e-${block.type}">\n${innerHtml}\n</div>`;

      const htmlNode: Html = {
        type: "html",
        value: html,
      };

      parent.children[index] = htmlNode;
    });
  };
};

export default remarkPf2e;
