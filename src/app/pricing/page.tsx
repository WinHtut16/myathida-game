import { AppShell } from "@/components/layout/AppShell";
import { getPricing } from "@/lib/data/catalogue";
import { getCurrentUser } from "@/lib/data/session";
import { PricingView } from "@/components/catalogue/PricingView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getT } from "@/i18n/server";

/**
 * Rate cards, reading the real `game.pricing`.
 *
 * The screen stays visible to a plain admin, read-only. Knowing the rates is
 * part of working the counter; only changing them is restricted. The old
 * version blocked the whole page, which meant staff had no way to check a
 * price without asking the manager.
 */
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [result, user, { t }] = await Promise.all([getPricing(), getCurrentUser(), getT()]);

  if (!result.ok) {
    return (
      <AppShell title={t("nav.pricing")}>
        <SetupNotice title={t("catalogue.unavailable")} message={result.message} />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("nav.pricing")}>
      <PricingView pricing={result.data} canEdit={user?.isSuperadmin ?? false} />
    </AppShell>
  );
}
