#!/usr/bin/env node
// Converts a methods file between Markdown and JSON.
//   node convert.mjs methods.md  > methods.json
//   node convert.mjs methods.json > methods.md
import { readFileSync } from "node:fs";
import process from "node:process";
import { parseMethods, methodsToMarkdown } from "./methods.mjs";

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: node convert.mjs <methods.md | methods.json>\n");
  process.exit(1);
}
const text = readFileSync(file, "utf8");
process.stdout.write(
  file.endsWith(".json")
    ? methodsToMarkdown(JSON.parse(text))
    : JSON.stringify(parseMethods(text), null, 2) + "\n",
);
