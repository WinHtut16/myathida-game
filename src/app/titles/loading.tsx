import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { TableCard } from "@/components/Skeleton";

export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("nav.games")}>
      <div className="p-4 sm:p-5 px-4 sm:px-[22px] max-w-[1100px] flex flex-col gap-4">
        <TableCard rows={6} />
      </div>
    </AppShell>
  );
}
