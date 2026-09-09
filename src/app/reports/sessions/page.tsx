import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SessionTable } from "@/components/reports/SessionTable";
import { getSessionHistory, type SessionHistoryFilters } from "@/lib/data/reports";
import { getCurrentUser } from "@/lib/data/session";
import { getT } from "@/i18n/server";
import { fill } from "@/lib/ui";
import type { MessageKey } from "@/i18n";

/**
 * The full session-history browser.
 *
 * A sibling of the reports dashboard, not a child screen of its own — the
 * dashboard shows a short recent tail, this shows everything, one page at a
 * time, narrowed by date / station / staff.
 *
 * Like the dashboard's period filter, the controls are a plain GET <form> and
 * ?query params, not client state: each view is a fresh server render, it
 * survives a reload, and it can be bookmarked or sent to the owner as a URL.
 */
export const dynamic = "force-dynamic";

type T = (k: MessageKey) => string;

/** "" and stray whitespace both mean "no filter". */
function clean(v: string | undefined): string | undefined {
  const s = v?.trim();
  return s ? s : undefined;
}

export default async function SessionHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const filters: SessionHistoryFilters = {
    from: clean(one("from")),
    to: clean(one("to")),
    stationId: clean(one("station")),
    staff: clean(one("staff")),
    page: Math.max(1, Number(one("page")) || 1),
  };

  const [data, { t }, user] = await Promise.all([
    getSessionHistory(filters),
    getT(),
    getCurrentUser(),
  ]);

  if (!data.ok) {
    return (
      <AppShell title={t("reports.history")}>
        <div className="p-6">
          <BackLink t={t} />
          <div className="max-w-[560px] bg-surface border border-line rounded-xl p-5 flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-status-expired-bg text-status-expired-ink flex items-center justify-center flex-none">
              <TriangleAlert size={17} />
            </span>
            <div>
              <div className="font-bold text-md mb-1">{t("reports.unavailable")}</div>
              <p className="text-sm text-text-secondary leading-relaxed m-0">{data.message}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const { sessions, staffNames, total, page, pageCount, stations, staffList } = data;
  const hasFilters = !!(filters.from || filters.to || filters.stationId || filters.staff);

  const hrefForPage = (p: number) => {
    const q = new URLSearchParams();
    if (filters.from) q.set("from", filters.from);
    if (filters.to) q.set("to", filters.to);
    if (filters.stationId) q.set("station", filters.stationId);
    if (filters.staff) q.set("staff", filters.staff);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `/reports/sessions?${s}` : "/reports/sessions";
  };

  return (
    <AppShell
      title={t("reports.history")}
      subtitle={fill(t("reports.resultCount"), { n: total })}
    >
      <div className="p-4 sm:p-5 px-4 sm:px-[22px] max-w-[1180px] flex flex-col gap-4">
        <BackLink t={t} />

        <Filters
          t={t}
          filters={filters}
          stations={stations}
          staffList={staffList}
          hasFilters={hasFilters}
        />

        <SessionTable
          sessions={sessions}
          staffNames={staffNames}
          canCorrect={user?.isSuperadmin ?? false}
          scroll={false}
          emptyLabel={hasFilters ? t("reports.noMatches") : t("reports.noneRecorded")}
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
      href="/reports"
      prefetch={false}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-accent w-fit"
    >
      <ArrowLeft size={15} />
      {t("reports.backToReports")}
    </Link>
  );
}

function Filters({
  t,
  filters,
  stations,
  staffList,
  hasFilters,
}: {
  t: T;
  filters: SessionHistoryFilters;
  stations: { id: string; name: string }[];
  staffList: { id: string; name: string }[];
  hasFilters: boolean;
}) {
  return (
    <form
      method="get"
      className="bg-surface border border-line rounded-lg p-[18px] flex flex-wrap items-end gap-3"
    >
      <FormField label={t("reports.filterFrom")}>
        <input
          type="date"
          name="from"
          defaultValue={filters.from ?? ""}
          className="cat-input tabular-nums"
        />
      </FormField>
      <FormField label={t("reports.filterTo")}>
        <input
          type="date"
          name="to"
          defaultValue={filters.to ?? ""}
          className="cat-input tabular-nums"
        />
      </FormField>
      <FormField label={t("reports.station")}>
        <select name="station" defaultValue={filters.stationId ?? ""} className="cat-input">
          <option value="">{t("reports.allStations")}</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label={t("reports.filterStaff")}>
        <select name="staff" defaultValue={filters.staff ?? ""} className="cat-input">
          <option value="">{t("reports.allStaff")}</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
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
            href="/reports/sessions"
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
  const cls =
    "inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 bg-surface";
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
