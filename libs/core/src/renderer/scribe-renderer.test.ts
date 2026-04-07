import { describe, it, expect } from "vitest";
import { parseScribe } from "../parser/scribe-parser.js";
import { renderScribeDocument } from "./scribe-renderer.js";

function render(input: string): string {
  const doc = parseScribe(input);
  return renderScribeDocument(doc);
}

describe("renderScribeDocument", () => {
  describe("page structure", () => {
    it("wraps content in page div", () => {
      const html = render("Hello world");
      expect(html).toContain('class="bg-paper page d-flex flex-wrap"');
      expect(html).toContain('class="page-overlay"');
    });

    it("creates multiple pages on page breaks", () => {
      const html = render("Page 1\n\n=\n\nPage 2\n\n=\n\nPage 3");
      const pageCount = (html.match(/class="bg-paper page/g) || []).length;
      expect(pageCount).toBe(3);
    });

    it("adds watermark to each page", () => {
      const html = render("watermark (\nDraft\n)\n\nText\n\n=\n\nMore text");
      const wmCount = (html.match(/class="watermark"/g) || []).length;
      expect(wmCount).toBe(2);
    });

    it("adds title to each page", () => {
      const html = render("title (\nMy Doc\n)\n\nText\n\n=\n\nMore text");
      const titleCount = (html.match(/class="title"/g) || []).length;
      expect(titleCount).toBe(2);
    });
  });

  describe("block rendering", () => {
    it("renders head block with correct class", () => {
      const html = render("head (\n# Title\nDesc\n-\n)");
      expect(html).toContain('class="head d-flex flex-wrap w-100"');
    });

    it("renders info block with correct class", () => {
      const html = render("info (\n## Info\nContent\n)");
      expect(html).toContain('class="info d-flex flex-wrap"');
    });

    it("renders note block with correct class", () => {
      const html = render("note (\n# Note Title\nContent\n)");
      expect(html).toContain('class="note d-flex flex-wrap"');
    });

    it("renders rules block with correct class", () => {
      const html = render("rules (\n# Rules\nContent\n)");
      expect(html).toContain('class="rules d-flex flex-wrap"');
    });

    it("renders math block with correct class", () => {
      const html = render("math (\nFormula here\n)");
      expect(html).toContain('class="math d-flex flex-wrap"');
    });

    it("renders left sidebar with correct class", () => {
      const html = render("left (\n# Sidebar\nContent\n)");
      expect(html).toContain('class="left d-flex flex-wrap"');
    });

    it("renders right sidebar with correct class", () => {
      const html = render("right (\n# Sidebar\nContent\n)");
      expect(html).toContain('class="right d-flex flex-wrap"');
    });
  });

  describe("item block rendering", () => {
    it("renders traits with edge divs", () => {
      const html = render("item(\n# Test\n-\n; uncommon,class,feat\nContent\n-\nBody\n)");
      expect(html).toContain('class="pf-trait pf-trait-edge"');
      expect(html).toContain('class="pf-trait pf-trait-uncommon"');
    });

    it("renders action symbols as base64 PNGs", () => {
      const html = render("item(\n# Strike :a:\n-\nBody\n)");
      expect(html).toContain('class="text-img"');
      expect(html).toContain("data:image/png;base64,");
    });
  });

  describe("content references", () => {
    it("expands {{key}} in paragraphs", () => {
      const html = render("myref {\nExpanded content\n}\n\n{{myref}}");
      expect(html).toContain("Expanded content");
    });

    it("expands refs from hidden section", () => {
      const html = render("{{hidden}}\n\n%\n\nhidden {\nnote(\n# Secret\nHidden note\n)\n}");
      expect(html).toContain("Secret");
    });

    it("warns on undefined key", () => {
      const html = render("{{undefined_key}}");
      expect(html).toContain("{{undefined_key}}");
    });
  });

  describe("inline formatting", () => {
    it("renders hanging indent for bold-prefixed paragraphs", () => {
      const html = render("item(\n# Test\n-\n**Bold** text after\n)");
      expect(html).toContain('<strong>');
    });

    it("renders label links", () => {
      const html = render("[link text](#some-label)");
      expect(html).toContain('data-label="some-label"');
      expect(html).toContain('class="pointer"');
    });
  });

  describe("CSS output", () => {
    it("includes font CSS", () => {
      const html = render("Hello");
      expect(html).toContain("ff-good-web-pro");
    });

    it("includes Google Fonts when fonts() block present", () => {
      const html = render("fonts(\nRoboto:wght@400\n)\n\nText");
      expect(html).toContain("fonts.googleapis.com");
      expect(html).toContain("Roboto");
    });

    it("includes page number CSS when pagenumbers keyword present", () => {
      const html = render("pagenumbers\n\nText");
      expect(html).toContain("counter-increment: pages");
    });

    it("includes custom CSS from css() block", () => {
      const html = render("css (\n.custom { color: red; }\n)\n\nText");
      expect(html).toContain(".custom { color: red; }");
    });
  });
});