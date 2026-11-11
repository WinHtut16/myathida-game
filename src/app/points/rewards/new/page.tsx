import { redirect } from "next/navigation";
import { PointsShell } from "@/components/points/PointsShell";
import { RewardForm } from "@/components/points/RewardForm";
import { getCurrentUser } from "@/lib/data/session";

/** Owner only. The database refuses anyone else; this just avoids a dead form. */
export default async function NewRewardPage() {
  const user = await getCurrentUser();
  if (!user?.isSuperadmin) redirect("/points/rewards");

  return (
    <PointsShell>
      <RewardForm reward={null} />
    </PointsShell>
  );
}
