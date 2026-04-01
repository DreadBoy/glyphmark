import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseScribe } from "../src/parser/scribe-parser.js";
import { renderScribeDocument } from "../src/renderer/scribe-renderer.js";

function render(input: string): string {
  const doc = parseScribe(input);
  return renderScribeDocument(doc);
}

describe("renderScribeDocument", () => {
  describe("page structure", () => {
    it("wraps content in page div", () => {
      const html = render("Hello world");
      assert.ok(html.includes('class="bg-paper page d-flex flex-wrap"'));
      assert.ok(html.includes('class="page-overlay"'));
    });

    it("creates multiple pages on page breaks", () => {
      const html = render("Page 1\n\n=\n\nPage 2\n\n=\n\nPage 3");
      const pageCount = (html.match(/class="bg-paper page/g) || []).length;
      assert.equal(pageCount, 3);
    });

    it("adds watermark to each page", () => {
      const html = render("watermark (\nDraft\n)\n\nText\n\n=\n\nMore text");
      const wmCount = (html.match(/class="watermark"/g) || []).length;
      assert.equal(wmCount, 2);
    });

    it("adds title to each page", () => {
      const html = render("title (\nMy Doc\n)\n\nText\n\n=\n\nMore text");
      const titleCount = (html.match(/class="title"/g) || []).length;
      assert.equal(titleCount, 2);
    });
  });

  describe("block rendering", () => {
    it("renders head block with correct class", () => {
      const html = render("head (\n# Title\nDesc\n-\n)");
      assert.ok(html.includes('class="head d-flex flex-wrap"'));
    });

    it("renders info block with correct class", () => {
      const html = render("info (\n## Info\nContent\n)");
      assert.ok(html.includes('class="info d-flex flex-wrap"'));
    });

    it("renders note block with correct class", () => {
      const html = render("note (\n# Note Title\nContent\n)");
      assert.ok(html.includes('class="note d-flex flex-wrap"'));
    });

    it("renders rules block with correct class", () => {
      const html = render("rules (\n# Rules\nContent\n)");
      assert.ok(html.includes('class="rules d-flex flex-wrap"'));
    });

    it("renders math block with correct class", () => {
      const html = render("math (\nFormula here\n)");
      assert.ok(html.includes('class="math d-flex flex-wrap"'));
    });

    it("renders left sidebar with correct class", () => {
      const html = render("left (\n# Sidebar\nContent\n)");
      assert.ok(html.includes('class="left d-flex flex-wrap"'));
    });

    it("renders right sidebar with correct class", () => {
      const html = render("right (\n# Sidebar\nContent\n)");
      assert.ok(html.includes('class="right d-flex flex-wrap"'));
    });
  });

  describe("item block rendering", () => {
    it("renders traits with edge divs", () => {
      const html = render("item(\n# Test\n-\n; uncommon,class,feat\nContent\n-\nBody\n)");
      assert.ok(html.includes('class="pf-trait pf-trait-edge"'));
      assert.ok(html.includes('class="pf-trait pf-trait-uncommon"'));
    });

    it("renders action symbols as base64 PNGs", () => {
      const html = render("item(\n# Strike :a:\n-\nBody\n)");
      assert.ok(html.includes('class="text-img"'));
      assert.ok(html.includes("data:image/png;base64,"));
    });
  });

  describe("content references", () => {
    it("expands {{key}} in paragraphs", () => {
      const html = render("myref {\nExpanded content\n}\n\n{{myref}}");
      assert.ok(html.includes("Expanded content"));
    });

    it("expands refs from hidden section", () => {
      const html = render("{{hidden}}\n\n%\n\nhidden {\nnote(\n# Secret\nHidden note\n)\n}");
      assert.ok(html.includes("Secret"));
    });

    it("warns on undefined key", () => {
      const html = render("{{undefined_key}}");
      assert.ok(html.includes("{{undefined_key}}"));
    });
  });

  describe("inline formatting", () => {
    it("renders hanging indent for bold-prefixed paragraphs", () => {
      const html = render("item(\n# Test\n-\n**Bold** text after\n)");
      assert.ok(html.includes('class="hang"'));
    });

    it("renders label links", () => {
      const html = render("[link text](#some-label)");
      assert.ok(html.includes('data-label="some-label"'));
      assert.ok(html.includes('class="pointer"'));
    });
  });

  describe("columns", () => {
    it("creates new column on column break", () => {
      const html = render("Left column\n\n|\n\nRight column");
      const columnCount = (html.match(/class="flex-even column"/g) || []).length;
      assert.ok(columnCount >= 2);
    });

    it("ends columns with row separator", () => {
      const html = render("Col 1\n\n|\n\nCol 2\n\n/\n\nFull width");
      assert.ok(html.includes('class="content w-100"'));
    });
  });

  describe("CSS output", () => {
    it("includes font CSS", () => {
      const html = render("Hello");
      assert.ok(html.includes("ff-good-web-pro"));
    });

    it("includes Google Fonts when fonts() block present", () => {
      const html = render("fonts(\nRoboto:wght@400\n)\n\nText");
      assert.ok(html.includes("fonts.googleapis.com"));
      assert.ok(html.includes("Roboto"));
    });

    it("includes page number CSS when pagenumbers keyword present", () => {
      const html = render("pagenumbers\n\nText");
      assert.ok(html.includes("counter-increment: pages"));
    });

    it("includes custom CSS from css() block", () => {
      const html = render("css (\n.custom { color: red; }\n)\n\nText");
      assert.ok(html.includes(".custom { color: red; }"));
    });
  });
});
