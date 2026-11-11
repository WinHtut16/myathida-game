import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { Bar, ListCard, SkeletonCard } from "@/components/Skeleton";

/** Covers every Points tab: the tab bar, then a list. */
export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("nav.points")}>
      <div className="p-4 sm:p-5 px-4 sm:px-[22px] w-full max-w-[960px] mx-auto flex flex-col gap-4">
        <SkeletonCard>
          <Bar w="280px" h={22} />
        </SkeletonCard>
        <ListCard rows={5} />
      </div>
    </AppShell>
  );
}
