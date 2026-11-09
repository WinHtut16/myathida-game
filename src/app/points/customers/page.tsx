import { PointsShell } from "@/components/points/PointsShell";
import { CustomersView } from "@/components/points/CustomersView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { CUSTOMERS_PAGE_SIZE, getCustomers } from "@/lib/data/points";
import { getT } from "@/i18n/server";

/** Points · Customers: everyone with game points, newest activity first. */
export const dynamic = "force-dynamic";

export default async function PointsCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim().slice(0, 50);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const [result, { t }] = await Promise.all([getCustomers(search, page), getT()]);

  return (
    <PointsShell>
      {result.ok ? (
        <CustomersView
          rows={result.data.rows}
          total={result.data.total}
          page={page}
          pageSize={CUSTOMERS_PAGE_SIZE}
          search={search}
        />
      ) : (
        <SetupNotice title={t("catalogue.unavailable")} message={result.message} />
      )}
    </PointsShell>
  );
}
