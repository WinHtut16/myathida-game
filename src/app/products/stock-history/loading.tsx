import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { Bar, SkeletonCard, TableCard } from "@/components/Skeleton";

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("stock.title")}>
      <div className="p-4 sm:p-5 px-4 sm:px-[22px] max-w-[1180px] flex flex-col gap-4">
        <Bar w="120px" h={16} />
        <SkeletonCard>
          <div className="flex flex-wrap gap-3">
            <Bar w="140px" h={38} />
            <Bar w="140px" h={38} />
            <Bar w="160px" h={38} />
            <Bar w="160px" h={38} />
            <Bar w="88px" h={38} />
          </div>
        </SkeletonCard>
        <TableCard rows={10} />
      </div>
    </AppShell>
  );
}
