"use client";

import { useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StationTile } from "@/components/station/StationTile";
import { RecordSessionModal } from "@/components/session/RecordSessionModal";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useAutoRefresh } from "@/lib/hooks/useAutoRefresh";
import { useT } from "@/i18n";
import { fill } from "@/lib/ui";
import type { Pricing, Product, StationView } from "@/lib/types";

/**
 * The interactive half of the floor board.
 *
 * Everything here is genuinely interactive - a search box, a modal, a pending
 * state - so it is a client component. What it is NOT is a data source: the
 * stations, pricing and products all arrive as props from the server component
 * that rendered it, and every write goes back out through a server action.
 * There is no Supabase call in this file and there must never be one.
 */
export function FloorBoard({
  stations,
  pricing,
  products,
}: {
  stations: StationView[];
  pricing: Pricing[];
  products: Product[];
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Stands in for Realtime, which Myanmar operators block. See the hook.
  useAutoRefresh();

  const occupied = stations.filter((v) => v.occupied).length;
  const filtered = stations.filter(
    (v) => query === "" || v.station.name.toLowerCase().includes(query.toLowerCase()),
  );

  const openRecord = (stationId: string | null) => {
    setRecordFor(stationId);
    setRecordOpen(true);
  };

  return (
    <AppShell
      title={t("floor.title")}
      subtitle={fill(t("floor.summary"), { n: stations.length, o: occupied })}
      contentClassName="flex flex-col"
      right={
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 bg-line-faint border border-line-soft rounded-lg px-3 py-2 text-text-muted text-[13px] w-[120px] sm:w-[180px]">
            <Search size={14} className="flex-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("floor.search")}
              className="bg-transparent outline-none flex-1 min-w-0 text-ink"
            />
          </div>
          <button
            onClick={() => openRecord(null)}
            className="flex items-center gap-2 bg-ink text-white rounded-lg px-3 sm:px-4 py-[11px] text-sm font-semibold whitespace-nowrap"
          >
            <Plus size={15} className="flex-none" />
            <span className="hidden sm:inline">{t("floor.record")}</span>
          </button>
        </div>
      }
    >
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mx-4 sm:mx-5 mt-4" />
      )}

      <div className="flex-1 overflow-auto p-4 sm:p-5 px-4 sm:px-[22px]">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 max-w-[1200px]">
          {filtered.map((v) => (
            <StationTile
              key={v.station.id}
              v={v}
              disabled={isPending}
              onError={setError}
              onPending={startTransition}
              onRecord={() => openRecord(v.station.id)}
            />
          ))}
        </div>
      </div>

      {recordOpen && (
        <RecordSessionModal
          stationId={recordFor}
          stations={stations}
          pricing={pricing}
          products={products}
          onError={setError}
          onClose={() => setRecordOpen(false)}
        />
      )}
    </AppShell>
  );
}
