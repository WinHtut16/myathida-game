"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { StationTile } from "@/components/station/StationTile";
import { RecordSessionModal } from "@/components/session/RecordSessionModal";
import { useStore } from "@/lib/data/store";
import { useT } from "@/i18n";
import { fill } from "@/lib/ui";

export default function FloorPage() {
  const { t } = useT();
  const { stationViews } = useStore();
  const [query, setQuery] = useState("");
  const [recordFor, setRecordFor] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);

  const occupied = stationViews.filter((v) => v.occupied).length;
  const filtered = stationViews.filter((v) => query === "" || v.station.name.toLowerCase().includes(query.toLowerCase()));

  const openRecord = (stationId: string | null) => {
    setRecordFor(stationId);
    setRecordOpen(true);
  };

  return (
    <AppShell
      title={t("floor.title")}
      subtitle={fill(t("floor.summary"), { n: stationViews.length, o: occupied })}
      contentClassName="flex flex-col"
      right={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-line-faint border border-line-soft rounded-lg px-3 py-2 text-text-muted text-[13px] w-[180px]">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("floor.search")}
              className="bg-transparent outline-none flex-1 text-ink"
            />
          </div>
          <button
            onClick={() => openRecord(null)}
            className="flex items-center gap-2 bg-ink text-white rounded-lg px-4 py-[11px] text-sm font-semibold"
          >
            <Plus size={15} />
            {t("floor.record")}
          </button>
        </div>
      }
    >
      <div className="flex-1 overflow-auto p-5 px-[22px]">
        <div className="grid grid-cols-4 gap-4 max-w-[1200px]">
          {filtered.map((v) => (
            <StationTile key={v.station.id} v={v} onRecord={() => openRecord(v.station.id)} />
          ))}
        </div>
      </div>

      {recordOpen && <RecordSessionModal stationId={recordFor} onClose={() => setRecordOpen(false)} />}
    </AppShell>
  );
}
