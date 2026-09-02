import { AppShell } from "@/components/layout/AppShell";
import { getProducts, getStockMovements } from "@/lib/data/catalogue";
import { getCurrentUser } from "@/lib/data/session";
import { getStaffDirectory } from "@/lib/data/staff-directory";
import { ProductsView } from "@/components/catalogue/ProductsView";
import { StockHistory } from "@/components/catalogue/StockHistory";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getT } from "@/i18n/server";

/** Snacks & drinks, reading the real `game.products` plus its stock ledger. */
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [result, movements, user, directory, { t }] = await Promise.all([
    getProducts(),
    getStockMovements(),
    getCurrentUser(),
    getStaffDirectory(),
    getT(),
  ]);

  if (!result.ok) {
    return (
      <AppShell title={t("nav.snacks")}>
        <SetupNotice title={t("catalogue.unavailable")} message={result.message} />
      </AppShell>
    );
  }

  const staffNames: Record<string, string> = {};
  for (const row of directory ?? []) staffNames[row.id] = row.name;

  return (
    <AppShell title={t("nav.snacks")}>
      <ProductsView products={result.data} canEdit={user?.isSuperadmin ?? false} />
      {/*
        Below the catalogue rather than beside it: you come to this screen to
        change a product, and only look at the history when a number surprises
        you.
      */}
      <div className="px-[22px] pb-6 max-w-[1200px]">
        <StockHistory
          movements={movements.ok ? movements.data : []}
          staffNames={staffNames}
          message={movements.ok ? undefined : movements.message}
        />
      </div>
    </AppShell>
  );
}
