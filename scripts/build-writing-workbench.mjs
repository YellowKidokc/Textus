import { build } from "vite";
import { copyFile, mkdir, cp } from "node:fs/promises";

// The e2e flow builds its own copy, so workers running at once don't
// empty each other's.
const out = process.argv[2] ?? "dist-workbench";

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: true,
    lib: {
      entry: "src/plugins/workbench/host.ts",
      name: "WritingWorkbench",
      formats: ["iife"],
      fileName: () => "host.js",
    },
  },
});
await mkdir(out, { recursive: true });
for (const file of [
  "textus-plugin.json",
  "view.html",
  "inspector.html",
  "README.md",
])
  await copyFile(`extensions/writing-workbench/${file}`, `${out}/${file}`);

await cp("extensions/writing-workbench/examples", `${out}/examples`, {
  recursive: true,
});
