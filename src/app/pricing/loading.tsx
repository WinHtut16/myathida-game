import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { TileRow, ChartCard, ListCard, TableCard, TileGrid, SkeletonCard, Bar } from "@/components/Skeleton";

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("nav.pricing")}>
      <div className="p-5 px-[22px] grid grid-cols-3 gap-4 max-w-[1100px]">
        <SkeletonCard><Bar w="40%" h={12} /><div className="mt-4"><Bar w="70%" h={26} /></div><div className="mt-4"><Bar h={34} /></div></SkeletonCard>
        <SkeletonCard><Bar w="40%" h={12} /><div className="mt-4"><Bar w="70%" h={26} /></div><div className="mt-4"><Bar h={34} /></div></SkeletonCard>
        <SkeletonCard><Bar w="40%" h={12} /><div className="mt-4"><Bar w="70%" h={26} /></div><div className="mt-4"><Bar h={34} /></div></SkeletonCard>
      </div>
    </AppShell>
  );
}
