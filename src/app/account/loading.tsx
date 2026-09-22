import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { SkeletonCard, Bar } from "@/components/Skeleton";

/**
 * Mirrors AccountView: two stacked cards in a 620px column — the details form
 * (name field + language toggle + save) and the password card. Same shapes so
 * the layout doesn't jump when the real screen lands.
 */
export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("account.title")}>
      <div className="p-5 px-[22px] max-w-[620px] flex flex-col gap-4">
        <SkeletonCard>
          <Bar w="42%" h={14} />
          <div className="mt-2">
            <Bar w="64%" h={10} />
          </div>
          <div className="mt-5">
            <Bar w="28%" h={10} />
            <div className="mt-2">
              <Bar h={38} />
            </div>
          </div>
          <div className="mt-5">
            <Bar w="20%" h={10} />
            <div className="mt-2">
              <Bar w="180px" h={32} />
            </div>
          </div>
          <div className="mt-5">
            <Bar w="120px" h={38} />
          </div>
        </SkeletonCard>

        <SkeletonCard>
          <div className="flex items-center gap-2.5">
            <Bar w="32px" h={32} />
            <Bar w="36%" h={14} />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Bar w="88%" h={10} />
            <Bar w="70%" h={10} />
          </div>
          <div className="mt-3">
            <Bar w="140px" h={12} />
          </div>
        </SkeletonCard>

        <SkeletonCard>
          <div className="flex items-center gap-2.5">
            <Bar w="32px" h={32} />
            <Bar w="30%" h={14} />
          </div>
          <div className="mt-3">
            <Bar w="110px" h={32} />
          </div>
        </SkeletonCard>
      </div>
    </AppShell>
  );
}
