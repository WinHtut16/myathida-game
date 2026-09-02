"use client";

import { ArrowDown, ArrowUp, History } from "lucide-react";
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
}: {
  movements: StockMovement[];
  staffNames: Record<string, string>;
  /** Set instead of movements when the ledger could not be read. */
  message?: string;
}) {
  const { t } = useT();

  return (
    <div className="bg-surface border border-line rounded-[10px] overflow-hidden">
      <div className="flex items-center gap-2 p-4 px-5 border-b border-line-faint">
        <History size={16} className="text-text-muted" />
        <span className="text-[15px] font-bold">{t("stock.title")}</span>
      </div>

      {message && (
        <div className="px-5 py-6 text-[13px] text-text-muted">{message}</div>
      )}

      {!message && movements.length === 0 && (
        <div className="px-5 py-8 text-center text-[13px] text-text-muted">
          {t("stock.none")}
        </div>
      )}

      {movements.map((m) => {
        const up = m.change > 0;
        return (
          <div
            key={m.id}
            className="grid grid-cols-[1.4fr_.9fr_.7fr_1fr] gap-3 px-5 py-2.5 border-b border-line-hair items-center text-[13px] last:border-0"
          >
            <span className="font-medium truncate">{m.productName}</span>
            <span className="text-text-secondary text-[12.5px]">{t(REASON_KEY[m.reason])}</span>
            <span
              className={cx(
                "font-mono font-semibold text-right",
                up ? "text-status-active-ink" : "text-text-secondary",
              )}
            >
              <span className="inline-flex items-center gap-0.5">
                {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                {Math.abs(m.change)}
              </span>
            </span>
            <span className="text-[11.5px] text-text-muted text-right truncate">
              {formatDateTime(m.createdAt)}
              {m.createdBy && staffNames[m.createdBy] ? ` · ${staffNames[m.createdBy]}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
