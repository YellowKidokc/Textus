#!/usr/bin/env node
// An MCP server that gives a desktop AI (Claude Desktop, Claude Code, Textus
// itself) the Markdown notes in one folder: list, read, search, write and
// append. Stdio, JSON-RPC 2.0, a message a line; no dependencies.
//
//   node server.mjs /path/to/notes      (or set TEXTUS_NOTES_DIR)
//
// Every path is relative to that folder; one that leaves it is refused.

import { promises as fs } from "node:fs";
import process from "node:process";
import path from "node:path";
import readline from "node:readline";
import { parseMethods, parseSeries } from "./methods.mjs";

const ROOT = path.resolve(
  process.argv[2] || process.env.TEXTUS_NOTES_DIR || ".",
);
const READ_ONLY = process.env.TEXTUS_NOTES_READ_ONLY === "1";
const NOTE = /\.(md|markdown|mdx|txt)$/i;
const MAX_READ = 200_000;
const MAX_HITS = 100;
const METHODS_FILE = process.env.TEXTUS_METHODS_FILE || "_methods.md";
const SERIES_FILE = "_series.md";

async function loadMethods() {
  try {
    return parseMethods(await fs.readFile(await inside(METHODS_FILE), "utf8"));
  } catch {
    return [];
  }
}

/** The nearest _series.md at or above a note's folder. */
async function findSeries(noteRel) {
  let dir = path.dirname(await inside(noteRel));
  for (;;) {
    const file = path.join(dir, SERIES_FILE);
    try {
      return {
        file: rel(file),
        ...parseSeries(await fs.readFile(file, "utf8")),
      };
    } catch {
      /* not here */
    }
    if (path.resolve(dir) === path.resolve(ROOT)) return null;
    dir = path.dirname(dir);
  }
}

const describe = (m) =>
  `### ${m.name} (${m.id}, ${m.level})\n` +
  (m.check ? `Check: ${m.check}\n` : "") +
  (m.prompt ? `Rewrite: ${m.prompt}\n` : "");

async function inside(rel) {
  if (typeof rel !== "string" || rel === "")
    throw new Error("path is required");
  const full = path.resolve(ROOT, rel);
  const root = await fs.realpath(ROOT);
  // Resolve symlinks of the nearest existing ancestor, so a link can't escape.
  let probe = full;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const rest = path.relative(probe, full);
      const resolved = path.join(real, rest);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) break;
      return full;
    } catch {
      const up = path.dirname(probe);
      if (up === probe) break;
      probe = up;
    }
  }
  throw new Error(`${rel} is outside the notes folder`);
}

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && NOTE.test(e.name)) yield full;
  }
}

const rel = (full) => path.relative(ROOT, full).split(path.sep).join("/");

const tools = {
  list_notes: {
    description:
      "List the Markdown notes in the folder, or under one subfolder.",
    inputSchema: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description: "Subfolder, relative to the notes folder",
        },
      },
    },
    async run({ folder }) {
      const dir = folder ? await inside(folder) : ROOT;
      const out = [];
      for await (const f of walk(dir)) out.push(rel(f));
      return out.sort().join("\n") || "(no notes)";
    },
  },
  read_note: {
    description: "Read one note's text.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async run({ path: p }) {
      const text = await fs.readFile(await inside(p), "utf8");
      return text.length > MAX_READ
        ? text.slice(0, MAX_READ) + "\n…(cut)"
        : text;
    },
  },
  search_notes: {
    description:
      "Find lines containing the words (case-insensitive) across every note.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    async run({ query }) {
      const q = String(query || "").toLowerCase();
      if (!q) throw new Error("query is required");
      const hits = [];
      for await (const f of walk(ROOT)) {
        const lines = (await fs.readFile(f, "utf8")).split("\n");
        lines.forEach((line, i) => {
          if (hits.length < MAX_HITS && line.toLowerCase().includes(q))
            hits.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 300)}`);
        });
        if (hits.length >= MAX_HITS) break;
      }
      return hits.join("\n") || "(no matches)";
    },
  },
  list_methods: {
    description:
      "List the writing methods in the methods file (_methods.md at the notes root): each has an id, a level (line = check sentence by sentence; shape = title, hook, opening, closing), what to check, and how to rewrite.",
    inputSchema: { type: "object", properties: {} },
    async run() {
      const all = await loadMethods();
      return (
        all.map(describe).join("\n") || `(no methods - add ${METHODS_FILE})`
      );
    },
  },
  get_checklist: {
    description:
      "The writing checklist for one note: the methods its series picked (the nearest _series.md above it) and the series outline. Check the note against each method; for line methods quote the sentences that miss, for shape methods offer three options.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "The note" } },
      required: ["path"],
    },
    async run({ path: p }) {
      const series = await findSeries(p);
      if (!series) return `(no ${SERIES_FILE} above ${p})`;
      const all = await loadMethods();
      const picked = series.methods.map(
        (id) => all.find((m) => m.id === id) || { id, missing: true },
      );
      const parts = [`Series: ${series.file}`, ""];
      for (const m of picked)
        parts.push(
          m.missing ? `### ${m.id} - not in ${METHODS_FILE}\n` : describe(m),
        );
      if (series.outline.length) parts.push("## Outline", ...series.outline);
      return parts.join("\n");
    },
  },
  write_note: {
    description:
      "Create a note, or replace one's whole text. Folders are made as needed.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    write: true,
    async run({ path: p, content }) {
      if (!NOTE.test(p))
        throw new Error("only .md, .markdown, .mdx or .txt files");
      const full = await inside(p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      const tmp = `${full}.${process.pid}.tmp`;
      await fs.writeFile(tmp, String(content), "utf8");
      await fs.rename(tmp, full);
      return `wrote ${rel(full)}`;
    },
  },
  append_note: {
    description: "Add text to the end of a note, creating it if missing.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    write: true,
    async run({ path: p, content }) {
      if (!NOTE.test(p))
        throw new Error("only .md, .markdown, .mdx or .txt files");
      const full = await inside(p);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.appendFile(full, "\n" + String(content), "utf8");
      return `appended to ${rel(full)}`;
    },
  },
};

const offered = Object.entries(tools).filter(
  ([, t]) => !(READ_ONLY && t.write),
);

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "textus-notes", version: "0.1.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: offered.map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    case "tools/call": {
      const entry = offered.find(([name]) => name === params?.name);
      if (!entry)
        throw Object.assign(new Error(`no tool ${params?.name}`), {
          code: -32602,
        });
      try {
        const text = await entry[1].run(params.arguments || {});
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return {
          content: [{ type: "text", text: String(e.message || e) }],
          isError: true,
        };
      }
    }
    default:
      if (id === undefined) return undefined; // a notification
      throw Object.assign(new Error(`unknown method ${method}`), {
        code: -32601,
      });
  }
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");

readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "parse error" },
    });
  }
  try {
    const result = await handle(msg);
    if (msg.id !== undefined && result !== undefined)
      send({ jsonrpc: "2.0", id: msg.id, result });
  } catch (e) {
    if (msg.id !== undefined)
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: e.code || -32603, message: e.message },
      });
  }
});

process.stderr.write(
  `textus-notes: serving ${ROOT}${READ_ONLY ? " (read-only)" : ""}\n`,
);
