import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { TileRow, ChartCard, ListCard, TableCard, TileGrid, SkeletonCard, Bar } from "@/components/Skeleton";

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("floor.title")}>
      <div className="flex-1 overflow-auto p-4 sm:p-5 px-4 sm:px-[22px]">
        <TileGrid />
      </div>
    </AppShell>
  );
}
