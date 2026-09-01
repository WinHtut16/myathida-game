import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { TileRow, ChartCard, ListCard, TableCard, TileGrid, SkeletonCard, Bar } from "@/components/Skeleton";

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("nav.settings")}>
      <div className="p-5 px-[22px] max-w-[1100px] flex flex-col gap-4">
        <ListCard rows={4} />
        <ListCard rows={3} />
      </div>
    </AppShell>
  );
}
