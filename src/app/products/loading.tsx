import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { TileRow, ChartCard, ListCard, TableCard, TileGrid, SkeletonCard, Bar } from "@/components/Skeleton";

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("nav.snacks")}>
      <div className="p-5 px-[22px] max-w-[1100px] flex flex-col gap-4">
        <TileRow count={3} />
        <TableCard rows={7} />
      </div>
    </AppShell>
  );
}
