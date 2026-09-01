import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { TileRow, ChartCard, ListCard, TableCard, TileGrid, SkeletonCard, Bar } from "@/components/Skeleton";

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("reports.title")}>
      <div className="p-5 px-[22px] max-w-[1180px] flex flex-col gap-4">
        <TileRow />
        <div className="grid grid-cols-2 gap-3.5">
          <ChartCard />
          <ChartCard />
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          <ListCard />
          <ListCard />
        </div>
        <TableCard />
      </div>
    </AppShell>
  );
}
