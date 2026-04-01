import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseScribe } from "../src/parser/scribe-parser.js";

describe("parseScribe", () => {
  describe("metadata extraction", () => {
    it("extracts watermark", () => {
      const doc = parseScribe("watermark (\nHello World\n)\n\nSome text");
      assert.equal(doc.watermark, "Hello World");
    });

    it("extracts title", () => {
      const doc = parseScribe("title (\nMy Title\n)\n\nSome text");
      assert.equal(doc.title, "My Title");
    });

    it("extracts custom CSS", () => {
      const doc = parseScribe("css (\n.foo { color: red; }\n)\n\nSome text");
      assert.equal(doc.customCss, ".foo { color: red; }");
    });

    it("extracts fonts", () => {
      const doc = parseScribe("fonts(\nRoboto:wght@400;700\nOpen Sans:wght@300\n)\n\nSome text");
      assert.deepEqual(doc.fonts, ["Roboto:wght@400;700", "Open Sans:wght@300"]);
    });

    it("detects pagenumbers", () => {
      const doc = parseScribe("pagenumbers\n\nSome text");
      assert.equal(doc.pageNumbers, true);
    });

    it("defaults pagenumbers to false", () => {
      const doc = parseScribe("Some text");
      assert.equal(doc.pageNumbers, false);
    });
  });

  describe("content references", () => {
    it("extracts content ref definitions", () => {
      const doc = parseScribe("myref {\nHello world\n}\n\nSome text");
      assert.equal(doc.contentRefs.get("myref"), "Hello world");
    });

    it("strips definitions from body", () => {
      const doc = parseScribe("myref {\nHello\n}\n\nVisible text");
      const hasRef = doc.body.some(
        (n) => n.type === "paragraph" && n.content.includes("myref {"),
      );
      assert.equal(hasRef, false);
    });

    it("extracts refs from hidden section", () => {
      const doc = parseScribe("Visible\n\n%\n\nsecret {\nnote(\n# Hidden\nContent here\n)\n}");
      assert.ok(doc.contentRefs.has("secret"));
    });

    it("extracts refs from HTML comments", () => {
      const doc = parseScribe("<!--\ncommented {\nInside comment\n}\n-->\n\nVisible");
      assert.ok(doc.contentRefs.has("commented"));
    });

    it("preserves {{key}} in body for rendering", () => {
      const doc = parseScribe("myref {\nHello\n}\n\n{{myref}}");
      const hasMustache = doc.body.some(
        (n) => n.type === "paragraph" && n.content.includes("{{myref}}"),
      );
      assert.equal(hasMustache, true);
    });
  });

  describe("block parsing", () => {
    it("parses page breaks", () => {
      const doc = parseScribe("Text\n\n=\n\nMore text");
      assert.ok(doc.body.some((n) => n.type === "page-break"));
    });

    it("parses column breaks", () => {
      const doc = parseScribe("Text\n\n|\n\nMore text");
      assert.ok(doc.body.some((n) => n.type === "column-break"));
    });

    it("parses end columns", () => {
      const doc = parseScribe("Text\n\n/\n\nMore text");
      assert.ok(doc.body.some((n) => n.type === "end-columns"));
    });

    it("parses head block", () => {
      const doc = parseScribe("head (\n# Title\nDescription\n-\n)");
      const head = doc.body.find((n) => n.type === "head");
      assert.ok(head);
    });

    it("parses info block", () => {
      const doc = parseScribe("info (\n## Info Title\nContent\n)");
      const info = doc.body.find((n) => n.type === "info");
      assert.ok(info);
    });

    it("parses headings with TOC labels", () => {
      const doc = parseScribe("# My Section ((+Section Label))");
      const heading = doc.body.find((n) => n.type === "heading");
      assert.ok(heading);
      if (heading?.type === "heading") {
        assert.equal(heading.text, "My Section");
        assert.equal(heading.tocLabel, "Section Label");
        assert.equal(heading.tocIndent, 1);
      }
    });
  });

  describe("item block parsing", () => {
    it("parses item with name and action", () => {
      const doc = parseScribe("item(\n# Cool Feat :a: ((+Feats))\n## Feat 3\n-\n; uncommon,class\nContent\n-\nBody text\n)");
      const item = doc.body.find((n) => n.type === "item");
      assert.ok(item);
      if (item?.type === "item") {
        assert.equal(item.name, "Cool Feat");
        assert.equal(item.nameActions, ":a:");
        assert.equal(item.subtitle, "Feat 3");
        assert.deepEqual(item.traits, ["uncommon", "class"]);
        assert.equal(item.tocLabel, "Feats");
      }
    });

    it("parses item without traits", () => {
      const doc = parseScribe("item(\n# Jennifer\n-\n### lg female champion\n)");
      const item = doc.body.find((n) => n.type === "item");
      assert.ok(item);
      if (item?.type === "item") {
        assert.equal(item.name, "Jennifer");
        assert.deepEqual(item.traits, []);
      }
    });
  });

  describe("table parsing", () => {
    it("parses basic table", () => {
      const doc = parseScribe("Header 1 | Header 2\n--- | :---:\nCell 1 | Cell 2");
      const table = doc.body.find((n) => n.type === "table");
      assert.ok(table);
      if (table?.type === "table") {
        assert.deepEqual(table.headers, ["Header 1", "Header 2"]);
        assert.deepEqual(table.alignments, ["left", "center"]);
        assert.equal(table.rows.length, 1);
      }
    });

    it("parses table footnotes", () => {
      const doc = parseScribe("A | B\n--- | ---\n1 | 2\n. * This is a footnote");
      const table = doc.body.find((n) => n.type === "table");
      assert.ok(table);
      if (table?.type === "table") {
        assert.equal(table.footnotes.length, 1);
        assert.equal(table.footnotes[0], "This is a footnote");
      }
    });
  });
});
