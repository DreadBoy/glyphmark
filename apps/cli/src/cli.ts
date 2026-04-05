#!/usr/bin/env node

import fs from "node:fs";
import { convert } from "@glyphmark/core";

const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error("Usage: glyphmark <input.scribe> <output.html>");
  process.exit(1);
}

const source = fs.readFileSync(input, "utf-8");
const html = convert(source);
fs.writeFileSync(output, html, "utf-8");
