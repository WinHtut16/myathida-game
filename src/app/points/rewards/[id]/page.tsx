import { redirect } from "next/navigation";
import { PointsShell } from "@/components/points/PointsShell";
import { RewardForm } from "@/components/points/RewardForm";
import { getReward } from "@/lib/data/points";
import { getCurrentUser } from "@/lib/data/session";

/** Edit one reward. Owner only; an unknown or another business's id goes back to the list. */
export const dynamic = "force-dynamic";

export default async function EditRewardPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user?.isSuperadmin) redirect("/points/rewards");

  // Behind the hub rewrite a dynamic param can arrive with an ".rsc" suffix.
  const reward = await getReward(id.replace(/\.rsc$/, ""));
  if (!reward.ok || !reward.data) redirect("/points/rewards");

  return (
    <PointsShell>
      <RewardForm reward={reward.data} />
    </PointsShell>
  );
}
