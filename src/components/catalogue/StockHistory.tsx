"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, History } from "lucide-react";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { formatDateTime } from "@/lib/format";
import type { StockMovement } from "@/lib/data/catalogue";
import type { MessageKey } from "@/i18n";

const REASON_KEY: Record<StockMovement["reason"], MessageKey> = {
  sale: "stock.sale",
  restock: "stock.restock",
  adjustment: "stock.adjustment",
  void_return: "stock.voidReturn",
};

/**
 * Where the stock went.
 *
 * Answers the one question a bare count cannot: the shelf says 12, the app
 * says 9, and this is the only place that says whether the difference was
 * three sales, a miscount, or a corrected session putting drinks back.
 */
export function StockHistory({
  movements,
  staffNames,
  message,
  scroll = true,
  viewAllHref,
  emptyLabel,
}: {
  movements: StockMovement[];
  staffNames: Record<string, string>;
  /** Set instead of movements when the ledger could not be read. */
  message?: string;
  /** Cap the body height and let it scroll — the short recent tail. The full
      browser page owns its own paging, so it turns this off. */
  scroll?: boolean;
  /** When set, a link to the full stock-history screen sits in the header. */
  viewAllHref?: string;
  /** Overrides the "nothing recorded" line (e.g. "no rows match the filters"). */
  emptyLabel?: string;
}) {
  const { t } = useT();
  const cols = "md:grid-cols-[1.6fr_.9fr_.7fr_1fr]";

  return (
    <div className="bg-surface border border-line rounded-md overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 px-5 border-b border-line-faint">
        <div className="flex items-center gap-2">
          <History size={16} className="text-text-muted" />
          <span className="text-md font-bold">{t("stock.title")}</span>
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            prefetch={false}
            className="inline-flex items-center gap-1 text-2xs font-semibold text-accent hover:underline whitespace-nowrap"
          >
            {t("stock.viewAll")}
            <ArrowRight size={12} />
          </Link>
        )}
      </div>

      {message && <div className="px-5 py-6 text-sm text-text-muted">{message}</div>}

      {!message && movements.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-text-muted">
          {emptyLabel ?? t("stock.none")}
        </div>
      )}

      {!message && movements.length > 0 && (
        <div className={scroll ? "max-h-[62vh] overflow-y-auto" : undefined}>
          {/* Real table from md up; each row collapses to a stacked card below
              md — see DESIGN.md's list pattern. */}
          <div
            className={cx(
              "hidden md:grid gap-3 px-5 py-2.5 border-b border-line-faint",
              "text-2xs tracking-caps uppercase text-text-muted font-semibold",
              cols,
              scroll && "sticky top-0 z-10 bg-surface",
            )}
          >
            <span>{t("products.name")}</span>
            <span>{t("stock.reason")}</span>
            <span className="text-right">{t("stock.change")}</span>
            <span className="text-right">{t("reports.when")}</span>
          </div>

          {movements.map((m) => {
            const up = m.change > 0;
            const who = m.createdBy ? staffNames[m.createdBy] : undefined;
            return (
              <div
                key={m.id}
                className={cx(
                  "flex flex-col gap-1 px-5 py-3",
                  "md:grid md:gap-3 md:py-2.5 md:items-center",
                  cols,
                  "border-b border-line-hair last:border-0 text-sm",
                )}
              >
                <span className="font-medium truncate">{m.productName}</span>

                <div className="flex items-center justify-between gap-3 md:contents">
                  <span className="text-text-secondary text-xs">{t(REASON_KEY[m.reason])}</span>
                  <span
                    className={cx(
                      "tabular-nums font-semibold md:text-right",
                      up ? "text-status-active-ink" : "text-text-secondary",
                    )}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      {Math.abs(m.change)}
                    </span>
                  </span>
                </div>

                <span className="text-2xs text-text-muted md:text-right truncate">
                  {formatDateTime(m.createdAt)}
                  {who ? ` · ${who}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
