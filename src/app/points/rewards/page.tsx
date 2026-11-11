import { PointsShell } from "@/components/points/PointsShell";
import { RewardsView } from "@/components/points/RewardsView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getRewards } from "@/lib/data/points";
import { getCurrentUser } from "@/lib/data/session";
import { getT } from "@/i18n/server";

/** Points · Rewards: what customers can redeem their game points for. */
export const dynamic = "force-dynamic";

export default async function PointsRewardsPage() {
  const [rewards, user, { t }] = await Promise.all([getRewards(), getCurrentUser(), getT()]);

  return (
    <PointsShell>
      {rewards.ok ? (
        <RewardsView rewards={rewards.data} isOwner={user?.isSuperadmin ?? false} />
      ) : (
        <SetupNotice title={t("catalogue.unavailable")} message={rewards.message} />
      )}
    </PointsShell>
  );
}
