import { AppShell } from "@/components/layout/AppShell";
import { getT } from "@/i18n/server";
import { SkeletonCard, Bar } from "@/components/Skeleton";

/**
 * Mirrors ExportPanel: one card in a 640px column — icon + title, intro line,
 * the scope segmented control, two date fields, and the download button.
 */
export default async function Loading() {
  const { t } = await getT();
  return (
    <AppShell title={t("nav.export")}>
      <div className="p-5 px-[22px] max-w-[640px] flex flex-col gap-4">
        <SkeletonCard>
          <div className="flex items-center gap-2.5">
            <Bar w="32px" h={32} />
            <Bar w="40%" h={14} />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Bar w="92%" h={10} />
            <Bar w="76%" h={10} />
          </div>
          <div className="mt-5">
            <Bar h={32} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Bar h={38} />
            <Bar h={38} />
          </div>
          <div className="mt-5">
            <Bar w="160px" h={40} />
          </div>
        </SkeletonCard>
      </div>
    </AppShell>
  );
}
