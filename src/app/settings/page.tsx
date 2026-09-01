import { AppShell } from "@/components/layout/AppShell";
import { getStations } from "@/lib/data/catalogue";
import { getStaffDirectory } from "@/lib/data/staff-directory";
import { getCurrentUser } from "@/lib/data/session";
import { SettingsView } from "@/components/catalogue/SettingsView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getT } from "@/i18n/server";

/**
 * Settings: the floor plan, who has access, and the language.
 *
 * Staff are listed but not created here, and that is deliberate rather than
 * unfinished. Reaching this app at all takes three rows: a profiles row on the
 * hub (its middleware checks that before anything else), an app_access grant,
 * and a game.staff row. A create form on this screen could write at most two
 * of them, and the account would look made while being turned away at the
 * door. The hub's staff screen writes all three, so that is where it belongs.
 */
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [stations, directory, user, { t }] = await Promise.all([
    getStations(),
    getStaffDirectory(),
    getCurrentUser(),
    getT(),
  ]);

  if (!stations.ok) {
    return (
      <AppShell title={t("nav.settings")}>
        <SetupNotice title={t("catalogue.unavailable")} message={stations.message} />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("nav.settings")}>
      <SettingsView
        stations={stations.data}
        staff={directory ?? []}
        canEdit={user?.isSuperadmin ?? false}
      />
    </AppShell>
  );
}
