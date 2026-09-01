import { AppShell } from "@/components/layout/AppShell";
import { getProducts } from "@/lib/data/catalogue";
import { getCurrentUser } from "@/lib/data/session";
import { ProductsView } from "@/components/catalogue/ProductsView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getT } from "@/i18n/server";

/** Snacks & drinks, reading the real `game.products`. */
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [result, user, { t }] = await Promise.all([getProducts(), getCurrentUser(), getT()]);

  if (!result.ok) {
    return (
      <AppShell title={t("nav.snacks")}>
        <SetupNotice title={t("catalogue.unavailable")} message={result.message} />
      </AppShell>
    );
  }

  return (
    <AppShell title={t("nav.snacks")}>
      <ProductsView products={result.data} canEdit={user?.isSuperadmin ?? false} />
    </AppShell>
  );
}
