import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StockHistory } from "@/components/catalogue/StockHistory";
import {
  getStockHistory,
  isStockReason,
  STOCK_REASONS,
  type StockHistoryFilters,
  type StockReason,
} from "@/lib/data/catalogue";
import { getT } from "@/i18n/server";
import { fill } from "@/lib/ui";
import type { MessageKey } from "@/i18n";

/**
 * The full stock-movement browser.
 *
 * A sibling of the Snacks screen, not a child of its own — the catalogue shows
 * a short recent tail of the ledger, this shows all of it, one page at a time,
 * narrowed by product / reason / date. Built like /reports/sessions: a plain
 * GET <form> and ?query params, no client state.
 */
export const dynamic = "force-dynamic";

type T = (k: MessageKey) => string;

const REASON_LABEL: Record<StockReason, MessageKey> = {
  sale: "stock.sale",
  restock: "stock.restock",
  adjustment: "stock.adjustment",
  void_return: "stock.voidReturn",
};

/** "" and stray whitespace both mean "no filter". */
function clean(v: string | undefined): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

export default async function StockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const reasonParam = clean(one("reason"));
  const filters: StockHistoryFilters = {
    from: clean(one("from")),
    to: clean(one("to")),
    productId: clean(one("product")),
    reason: isStockReason(reasonParam) ? reasonParam : undefined,
    page: Math.max(1, Number(one("page")) || 1),
  };

  const [data, { t }] = await Promise.all([getStockHistory(filters), getT()]);

  if (!data.ok) {
    return (
      <AppShell title={t("stock.title")}>
        <div className="p-6">
          <BackLink t={t} />
          <div className="max-w-[560px] bg-surface border border-line rounded-xl p-5 flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-status-expired-bg text-status-expired-ink flex items-center justify-center flex-none">
              <TriangleAlert size={17} />
            </span>
            <div>
              <div className="font-bold text-md mb-1">{t("catalogue.unavailable")}</div>
              <p className="text-sm text-text-secondary leading-relaxed m-0">{data.message}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const { movements, staffNames, total, page, pageCount, products } = data;
  const hasFilters = !!(filters.from || filters.to || filters.productId || filters.reason);

  const hrefForPage = (p: number) => {
    const q = new URLSearchParams();
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    if (filters.productId) q.set("product", filters.productId);
    if (filters.reason) q.set("reason", filters.reason);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/products/stock-history?${s}` : "/products/stock-history";
  };

  return (
    <AppShell title={t("stock.title")} subtitle={fill(t("reports.resultCount"), { n: total })}>
      <div className="p-4 sm:p-5 px-4 sm:px-[22px] max-w-[1180px] flex flex-col gap-4">
        <BackLink t={t} />

        <Filters t={t} filters={filters} products={products} hasFilters={hasFilters} />

        <StockHistory
          movements={movements}
          staffNames={staffNames}
          scroll={false}
          emptyLabel={hasFilters ? t("reports.noMatches") : t("stock.none")}
        />

        {pageCount > 1 && (
          <div className="flex items-center justify-between text-xs font-semibold">
            <PagerLink href={hrefForPage(page - 1)} disabled={page <= 1}>
              <ChevronLeft size={14} />
              {t("reports.prevPage")}
            </PagerLink>
            <span className="text-text-muted tabular-nums">
              {fill(t("reports.pageOf"), { n: page, total: pageCount })}
            </span>
            <PagerLink href={hrefForPage(page + 1)} disabled={page >= pageCount}>
              {t("reports.nextPage")}
              <ChevronRight size={14} />
            </PagerLink>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function BackLink({ t }: { t: T }) {
  return (
    <Link
      href="/products"
      prefetch={false}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-accent w-fit"
    >
      <ArrowLeft size={15} />
      {t("stock.backToProducts")}
    </Link>
  );
}

function Filters({
  t,
  filters,
  products,
  hasFilters,
}: {
  t: T;
  filters: StockHistoryFilters;
  products: { id: string; name: string }[];
  hasFilters: boolean;
}) {
  return (
    <form
      method="get"
      className="bg-surface border border-line rounded-lg p-[18px] flex flex-wrap items-end gap-3"
    >
      <FormField label={t("reports.filterFrom")}>
        <input type="date" name="from" defaultValue={filters.from ?? ""} className="cat-input tabular-nums" />
      </FormField>
      <FormField label={t("reports.filterTo")}>
        <input type="date" name="to" defaultValue={filters.to ?? ""} className="cat-input tabular-nums" />
      </FormField>
      <FormField label={t("stock.filterProduct")}>
        <select name="product" defaultValue={filters.productId ?? ""} className="cat-input">
          <option value="">{t("stock.allProducts")}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t("stock.filterReason")}>
        <select name="reason" defaultValue={filters.reason ?? ""} className="cat-input">
          <option value="">{t("stock.allReasons")}</option>
          {STOCK_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(REASON_LABEL[r])}
            </option>
          ))}
        </select>
      </FormField>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="bg-accent text-white rounded-md hover:bg-accent-strong transition-colors px-4 py-2 text-sm font-semibold"
        >
          {t("reports.applyFilters")}
        </button>
        {hasFilters && (
          <a
            href="/products/stock-history"
            className="text-sm font-semibold text-text-secondary hover:text-accent"
          >
            {t("reports.clearFilters")}
          </a>
        )}
      </div>
    </form>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs tracking-caps uppercase text-text-muted font-semibold">{label}</span>
      {children}
    </label>
  );
}

function PagerLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const cls = "inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 bg-surface";
  if (disabled) {
    return (
      <span className={`${cls} text-text-muted opacity-45`} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} prefetch={false} className={`${cls} text-text-secondary hover:text-accent hover:border-accent`}>
      {children}
    </Link>
  );
}
