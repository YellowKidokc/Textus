import { build } from "vite";
import { copyFile, mkdir, cp } from "node:fs/promises";

await build({
  configFile: false,
  publicDir: false,
  build: {
    outDir: "dist-workbench",
    emptyOutDir: true,
    lib: {
      entry: "src/plugins/workbench/host.ts",
      name: "WritingWorkbench",
      formats: ["iife"],
      fileName: () => "host.js",
    },
  },
});
await mkdir("dist-workbench", { recursive: true });
for (const file of [
  "textus-plugin.json",
  "view.html",
  "inspector.html",
  "README.md",
])
  await copyFile(
    `extensions/writing-workbench/${file}`,
    `dist-workbench/${file}`,
  );

await cp("extensions/writing-workbench/examples", "dist-workbench/examples", {
  recursive: true,
});
