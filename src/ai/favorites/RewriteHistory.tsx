import { exportDoc, fs } from "../../platform/ipc";
import { readBoot } from "../../storage/boot";
import { escapeHtml } from "../../utils/html";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "../../ui/useModalDialog";
import {
  rewriteJournal,
  type RewriteEvent,
} from "../../platform/rewrite-journal";
import type { Strings } from "../../i18n/strings";

export function RewriteHistory({
  onClose,
  t,
}: {
  onClose: () => void;
  t: Strings;
}) {
  const dialog = useModalDialog(onClose);
  const [events, setEvents] = useState<RewriteEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      void rewriteJournal
        .list()
        .then((e) => {
          if (active) setEvents(e);
        })
        .catch((e: unknown) => {
          if (active) setError(String(e));
        });
    };
    load();
    window.addEventListener("rewrite-journal-changed", load);
    return () => {
      active = false;
      window.removeEventListener("rewrite-journal-changed", load);
    };
  }, []);
  const groups = [...new Set(events.map((e) => e.group))];
  const saveFile = async (
    contents: string,
    extension: string,
    type: string,
  ) => {
    try {
      if (readBoot()) {
        const path = await exportDoc.exportSaveDialog(
          `textus-rewrite-history.${extension}`,
          extension.toUpperCase(),
          extension,
        );
        if (path) await fs.writeTextFile(path, contents);
      } else {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `textus-rewrite-history.${extension}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      setError(String(error));
    }
  };
  const download = () => {
    void saveFile(JSON.stringify(events, null, 2), "json", "application/json");
  };
  const downloadHtml = () => {
    const report = dialog.ref.current?.cloneNode(true) as
      HTMLElement | undefined;
    if (!report) return;
    report.querySelectorAll("button").forEach((button) => button.remove());
    report.removeAttribute("role");
    report.removeAttribute("aria-modal");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t.favoriteHistory)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:16px;color:#111;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}article{border:1px solid #aaa;padding:16px;margin:16px 0;break-inside:avoid}section{border-top:2px solid #777;margin-top:24px}.favorite-history-chosen{border:3px solid #333}@page{margin:16mm}</style></head><body>${report.outerHTML}</body></html>`;
    void saveFile(html, "html", "text/html");
  };
  return createPortal(
    <div className="favorite-dialog-backdrop favorite-history-backdrop">
      <div
        {...dialog}
        className="favorite-dialog favorite-history"
        role="dialog"
        aria-modal="true"
        aria-label={t.favoriteHistory}
      >
        <header>
          <h2>{t.favoriteHistory}</h2>
          <button type="button" onClick={downloadHtml}>
            HTML
          </button>
          <button type="button" onClick={download}>
            {t.favoriteExport}
          </button>
          <button type="button" onClick={() => window.print()}>
            {t.favoritePrint}
          </button>
          <button type="button" onClick={onClose}>
            {t.settingsDone}
          </button>
        </header>
        <p>{t.favoriteHistoryHint}</p>
        {error && <p role="alert">{error}</p>}
        {!events.length && <p>{t.favoriteHistoryEmpty}</p>}
        {groups.map((group) => {
          const records = events.filter((e) => e.group === group);
          const requests = records.filter((e) => e.type === "request");
          const final = records
            .filter((e) => ["applied", "undo", "redo"].includes(e.type))
            .at(-1);
          return (
            <section className="favorite-history-group" key={group}>
              <h3>{requests[0]?.document}</h3>
              <h4>{t.favoriteOriginal}</h4>
              <pre>{requests[0]?.original}</pre>
              {requests.map((request, index) => {
                const responses = records.filter(
                  (e) =>
                    e.request === request.request &&
                    (e.type === "response" || e.type === "error"),
                );
                return (
                  <article
                    key={request.id}
                    className={
                      final?.choice === request.request
                        ? "favorite-history-chosen"
                        : ""
                    }
                  >
                    <h4>
                      {t.favoriteVersions} {index + 1}: {request.action}
                      {final?.choice === request.request
                        ? ` · ${t.favoriteKept}`
                        : ""}
                    </h4>
                    <time dateTime={request.time}>
                      {new Date(request.time).toLocaleString()}
                    </time>
                    <p>
                      {request.provider}
                      {request.model ? ` · ${request.model}` : ""}
                    </p>
                    <p>{request.instruction}</p>
                    <h5>{t.favoriteInput}</h5>
                    <pre>{request.original}</pre>
                    {responses.map((response) => (
                      <div key={response.id}>
                        <h5>
                          {response.type === "error"
                            ? t.favoriteFailed
                            : t.favoriteOutput}
                        </h5>
                        <pre>{response.text}</pre>
                      </div>
                    ))}
                  </article>
                );
              })}
              <ol className="favorite-decision-history">
                {records
                  .filter((e) =>
                    ["decision", "applied", "undo", "redo"].includes(e.type),
                  )
                  .map((record) => (
                    <li key={record.id}>
                      <strong>
                        {record.type === "undo"
                          ? t.menuUndo
                          : record.type === "redo"
                            ? t.menuRedo
                            : record.choice === "discarded"
                              ? t.favoriteDiscarded
                              : record.type === "decision"
                                ? t.favoriteKeep
                                : t.favoriteKept}
                      </strong>
                      {" · "}
                      <time dateTime={record.time}>
                        {new Date(record.time).toLocaleString()}
                      </time>
                      <pre>{record.text}</pre>
                    </li>
                  ))}
              </ol>
              <h4>
                {final
                  ? final.choice === "discarded"
                    ? t.favoriteDiscarded
                    : t.favoriteKept
                  : t.favoriteUndecided}
              </h4>
              {final && <pre>{final.text}</pre>}
            </section>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
