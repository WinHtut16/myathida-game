import { PointsShell } from "@/components/points/PointsShell";
import { RequestsView } from "@/components/points/RequestsView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getRequests } from "@/lib/data/points";
import { getCurrentUser } from "@/lib/data/session";
import { getT } from "@/i18n/server";

/** Points · Requests: reward requests from customers, then resolved history. */
export const dynamic = "force-dynamic";

export default async function PointsRequestsPage() {
  const [pending, history, user, { t }] = await Promise.all([
    getRequests("pending"),
    getRequests("history"),
    getCurrentUser(),
    getT(),
  ]);

  return (
    <PointsShell>
      {!pending.ok || !history.ok ? (
        <SetupNotice
          title={t("catalogue.unavailable")}
          message={!pending.ok ? pending.message : !history.ok ? history.message : ""}
        />
      ) : (
        <RequestsView pending={pending.data} history={history.data} isOwner={user?.isSuperadmin ?? false} />
      )}
    </PointsShell>
  );
}
