import { redirect } from "next/navigation";
import { PointsShell } from "@/components/points/PointsShell";
import { CustomerDetail } from "@/components/points/CustomerDetail";
import { getCustomer } from "@/lib/data/points";

/** One customer's game balance, history and corrections. */
export const dynamic = "force-dynamic";

export default async function PointsCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Behind the hub rewrite a dynamic param can arrive with an ".rsc" suffix.
  const customer = await getCustomer(id.replace(/\.rsc$/, ""));
  if (!customer.ok) redirect("/points/customers");

  return (
    <PointsShell>
      <CustomerDetail customer={customer.data} />
    </PointsShell>
  );
}
