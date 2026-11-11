"use client";

import Link from "next/link";
import { ChevronRight, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useT } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import type { LoyaltyCustomerRow } from "@/lib/types";
import { cx, fill } from "@/lib/ui";

/**
 * Customers with points at the game shop, most recent activity first -
 * futsal's Customers page, scoped to this shop. Search is a plain GET form
 * (?q=), paging is plain links (?page=), so everything renders on the server.
 */
export function CustomersView({
  rows,
  total,
  page,
  pageSize,
  search,
}: {
  rows: LoyaltyCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
}) {
  const { t } = useT();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => `/points/customers?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(p) })}`;

  return (
    <>
      <form method="get" className="flex gap-2 max-w-[460px]">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            name="q"
            defaultValue={search}
            placeholder={t("pts.search")}
            className="w-full bg-surface border border-line rounded-md pl-9 pr-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Users} message={t("pts.noCustomers")} />
      ) : (
        <div className="bg-surface border border-line rounded-md overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_.9fr_.9fr_1.2fr_24px] gap-3 p-3 px-5 border-b border-line-faint text-2xs tracking-caps uppercase text-text-muted font-semibold">
            <span>{t("pts.col.customer")}</span>
            <span className="text-right">{t("pts.col.balance")}</span>
            <span className="text-right">{t("pts.col.earned")}</span>
            <span className="text-right">{t("pts.col.last")}</span>
            <span />
          </div>
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/points/customers/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 md:grid md:grid-cols-[2fr_.9fr_.9fr_1.2fr_24px] md:px-5 border-b border-line-hair last:border-0 hover:bg-line-faint transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold truncate">{c.username}</span>
                <span className="block text-xs text-text-muted tabular-nums">{c.phone}</span>
              </span>
              <span className={cx("text-sm font-semibold tabular-nums md:text-right", c.balance < 0 && "text-status-expired-ink")}>
                {c.balance.toLocaleString()} <span className="text-2xs text-text-muted font-normal">{t("pts.unit")}</span>
              </span>
              <span className="hidden md:block text-sm tabular-nums text-right text-text-secondary">{c.earned.toLocaleString()}</span>
              <span className="hidden md:block text-xs tabular-nums text-right text-text-muted">
                {c.lastActivity ? formatDateTime(c.lastActivity) : "—"}
              </span>
              <ChevronRight size={16} className="text-text-faint flex-none" />
            </Link>
          ))}
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-text-muted tabular-nums">{fill(t("pts.showing"), { from, to, total })}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href(page - 1)} className="border border-line rounded-md px-3 py-1.5 font-semibold hover:bg-line-faint">
                {t("pts.prev")}
              </Link>
            )}
            {to < total && (
              <Link href={href(page + 1)} className="border border-line rounded-md px-3 py-1.5 font-semibold hover:bg-line-faint">
                {t("pts.next")}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
