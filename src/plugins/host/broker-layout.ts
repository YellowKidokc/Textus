import { links } from "../../platform/ipc";
import { splitLayout } from "../../app/split/split-layout";
import { panesOf } from "../../app/split/split-tree";
import { getWindowAccess, type PluginLocation } from "../app-bridge";
import { localize } from "../store/manifest";
import { webviewsOf } from "../views/webviews";
import { webPageUrl } from "../views/web-page-url";
import { showInspector, FOCUS_WRITING } from "../../app/inspector-tabs";
import { setComparisonScrolling } from "../comparison-window";
import {
  optionalStr,
  str,
  whereOf,
  type Params,
  type PluginScope,
} from "./broker-scope";

/** A location as the runtime sends it, checked. */
export function locationOf(value: unknown): PluginLocation {
  if (!value || typeof value !== "object")
    throw new Error("A location is { path, ... }.");
  const v = value as Record<string, unknown>;
  const num = (x: unknown) =>
    typeof x === "number" && Number.isFinite(x) ? x : undefined;
  return {
    path: str(v.path, "location.path"),
    line: num(v.line),
    heading: optionalStr(v.heading),
    block: optionalStr(v.block),
    text: optionalStr(v.text),
    page: num(v.page),
    fragment: optionalStr(v.fragment),
  };
}

/** Whether `host` is one the plugin may reach (`network:<host>`). */
export function hostGranted(p: PluginScope, host: string): boolean {
  const granted = p.info.granted;
  return (
    granted.includes("network:*") ||
    granted.includes(`network:${host}`) ||
    granted.some(
      (g) =>
        g.startsWith("network:*.") &&
        host.endsWith(g.slice("network:*".length)),
    )
  );
}

/**
 * A plugin's calls about tabs and panes: opening a file, a view, a web page or
 * a new document, and what the window shows. Opening a file needs files.read,
 * except the file a view of the plugin's already shows.
 */
export function layoutHandlers(p: PluginScope) {
  const access = () => {
    const w = getWindowAccess();
    if (!w) throw new Error("The window isn't ready.");
    return w;
  };
  return {
    "layout.linkComparison": ({ id, on }: Params) => {
      p.need("editor.targets");
      return setComparisonScrolling(`${p.id}:${str(id, "id")}`, on === true);
    },
    "layout.openComparison": (args: Params) => {
      p.need("editor.targets");
      p.need("files.read");
      const id = str(args.id, "id");
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
        throw new Error("Invalid comparison identity.");
      const originalText = str(args.originalText, "originalText");
      if (originalText.length > 2_000_000)
        throw new Error("Snapshot too large.");
      return access().openComparison({
        id: `${p.id}:${id}`,
        originalText,
        originalTitle: p.t().workbenchOriginal,
        originalVersion: str(args.originalVersion, "originalVersion"),
        revisionPath: str(args.revisionPath, "revisionPath"),
        revisionTitle: str(args.revisionTitle, "revisionTitle"),
        ratio:
          typeof args.ratio === "number" &&
          args.ratio >= 0.2 &&
          args.ratio <= 0.8
            ? args.ratio
            : 0.5,
      });
    },
    "layout.showInspector": ({ id }: Params) => {
      const own = p
        .manifest()
        .contributes.sidebarTabs.find((t) => t.id === id && t.side === "right");
      if (!own) throw new Error("No declared inspector.");
      showInspector(own.id);
    },
    "layout.focusWriting": ({ on }: Params) =>
      window.dispatchEvent(
        new CustomEvent(FOCUS_WRITING, { detail: on === true }),
      ),

    "layout.open": ({ location, where, asDocument }: Params) => {
      const place = locationOf(location);
      if (!webviewsOf(p.id).some((view) => view.resource === place.path))
        p.need("files.read");
      const { path, ...rest } = place;
      access().openFile(path, {
        place: rest,
        asDocument: asDocument === true,
        where: whereOf(where),
      });
    },
    "layout.openView": ({ view, where, title, state }: Params) => {
      const id = str(view, "view");
      const declared = p.manifest().contributes.views.find((v) => v.id === id);
      if (!declared) throw new Error(`No view ${id} in the manifest.`);
      access().openPluginTab(
        {
          plugin: p.id,
          view: id,
          kind: declared.type === "list" ? "list" : "view",
          title:
            optionalStr(title) ??
            localize(p.manifest(), declared.title, p.deps.language()),
          state,
        },
        whereOf(where),
      );
    },
    "layout.openWebPage": ({ url, where, title }: Params) => {
      const address = webPageUrl(str(url, "url"));
      if (!address) throw new Error("Only an https:// page opens in a tab.");
      const host = new URL(address).hostname;
      if (!hostGranted(p, host))
        throw new Error(`${p.id} was not granted network:${host}.`);
      access().openPluginTab(
        {
          plugin: p.id,
          view: "web",
          kind: "web",
          resource: address,
          title: optionalStr(title) ?? host,
        },
        whereOf(where),
      );
    },
    "layout.openUntitled": ({ text, where, title }: Params) =>
      access().openUntitled(
        str(text, "text"),
        optionalStr(title),
        whereOf(where),
      ),
    "layout.openExternal": ({ url }: Params) => {
      const address = str(url, "url");
      if (!/^https?:\/\//i.test(address))
        throw new Error("Only web links open in the browser.");
      return links.openWebLink(address);
    },
    "layout.activeTab": () => access().activeTab(),
    "layout.tabs": () => access().tabs(),
    "layout.split": () => {
      // The outermost way the panes run, and each pane's tab in front.
      const layout = splitLayout();
      return layout
        ? {
            direction: layout.root.direction,
            sizes: layout.root.sizes,
            panes: panesOf(layout.root).map((p) => p.front),
          }
        : { direction: null, panes: [] };
    },
  };
}
