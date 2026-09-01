"use client";

import { useState } from "react";
import { Download, Loader2, TriangleAlert, Database } from "lucide-react";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";

type Scope = "all" | "month" | "range";

/**
 * Download the shop's books as a spreadsheet.
 *
 * The download is a plain fetch → blob → anchor rather than a link, because
 * the route answers 403/500 as JSON and a bare <a> would navigate the browser
 * to that JSON instead of showing the reason. Fetching lets a refusal stay on
 * this screen as a readable message.
 */
export function ExportPanel() {
  const { t } = useT();
  const now = new Date();
  const [scope, setScope] = useState<Scope>("all");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (scope === "month") {
        params.set("year", String(year));
        params.set("month", String(month));
      }
      if (scope === "range") {
        if (!from || !to) {
          setError(t("export.pickRange"));
          return;
        }
        params.set("from", from);
        params.set("to", to);
      }

      const res = await fetch(`/admin/game/api/export?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? t("export.failed"));
        return;
      }

      const blob = await res.blob();
      const name =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "myathida-game.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("export.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 px-[22px] max-w-[640px] flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#e5b8b0] bg-[#fdf3f1] px-4 py-3 text-[13px] text-[#8a3324]">
          <TriangleAlert size={16} className="mt-px flex-none" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="font-semibold underline underline-offset-2">
            {t("common.dismiss")}
          </button>
        </div>
      )}

      <div className="bg-surface border border-line rounded-[11px] p-[22px]">
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="w-8 h-8 rounded-lg bg-line-faint flex items-center justify-center text-text-muted">
            <Database size={16} />
          </span>
          <h2 className="text-[15px] font-bold m-0">{t("export.title")}</h2>
        </div>
        <p className="text-[12.5px] text-text-secondary leading-relaxed m-0 mb-5">
          {t("export.intro")}
        </p>

        <div className="flex bg-line-faint border border-line-soft rounded-lg p-[3px] text-[12.5px] font-semibold mb-4">
          {(["all", "month", "range"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              disabled={busy}
              className={cx(
                "flex-1 text-center rounded-md px-3 py-1.5",
                scope === s ? "bg-ink text-white" : "text-text-secondary",
              )}
            >
              {t(
                s === "all" ? "export.scopeAll" : s === "month" ? "export.scopeMonth" : "export.scopeRange",
              )}
            </button>
          ))}
        </div>

        {scope === "month" && (
          <div className="flex gap-3 mb-4">
            <label className="flex-1">
              <span className="block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
                {t("export.month")}
              </span>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                disabled={busy}
                className="cat-input"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1">
              <span className="block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
                {t("export.year")}
              </span>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                disabled={busy}
                className="cat-input"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {scope === "range" && (
          <div className="flex gap-3 mb-4">
            <label className="flex-1">
              <span className="block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
                {t("export.from")}
              </span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={busy}
                className="cat-input"
              />
            </label>
            <label className="flex-1">
              <span className="block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
                {t("export.to")}
              </span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={busy}
                className="cat-input"
              />
            </label>
          </div>
        )}

        <button
          onClick={download}
          disabled={busy}
          className="flex items-center gap-2 bg-ink text-white rounded-lg px-5 py-3 text-sm font-semibold disabled:opacity-45"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {busy ? t("export.building") : t("export.download")}
        </button>

        <p className="text-[11.5px] text-text-muted leading-relaxed mt-4 mb-0">
          {t("export.snapshotNote")}
        </p>
      </div>
    </div>
  );
}
