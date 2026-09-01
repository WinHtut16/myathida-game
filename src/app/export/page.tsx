import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/data/session";
import { ExportPanel } from "@/components/catalogue/ExportPanel";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getT } from "@/i18n/server";

/**
 * Backup / export. Superadmin only — the route enforces it too, so this check
 * decides what to SHOW, never what is allowed.
 */
export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const [user, { t }] = await Promise.all([getCurrentUser(), getT()]);

  if (!user?.isSuperadmin) {
    return (
      <AppShell title={t("nav.export")}>
        <SetupNotice title={t("nav.export")} message={t("export.superOnly")} />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("nav.export")}>
      <ExportPanel />
    </AppShell>
  );
}
