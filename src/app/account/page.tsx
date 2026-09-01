import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/lib/data/session";
import { AccountView } from "@/components/catalogue/AccountView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getT } from "@/i18n/server";

/** The signed-in person's own name and reading language. */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [user, { t }] = await Promise.all([getCurrentUser(), getT()]);

  if (!user) {
    return (
      <AppShell title={t("account.title")}>
        <SetupNotice
          title={t("catalogue.unavailable")}
          message="No staff record was found for this account. It needs a 'game' row in public.app_access and an active row in game.staff."
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("account.title")}>
      <AccountView name={user.name} role={user.role} />
    </AppShell>
  );
}
