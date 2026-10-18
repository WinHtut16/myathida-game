import { AppShell } from "@/components/layout/AppShell";
import { getTitles } from "@/lib/data/titles";
import { TitlesView } from "@/components/catalogue/TitlesView";
import { SetupNotice } from "@/components/catalogue/SetupNotice";
import { getT } from "@/i18n/server";

/** Games on the shelf (game.titles), shown on the park's public /games page. */
export const dynamic = "force-dynamic";

export default async function TitlesPage() {
  const [result, { t }] = await Promise.all([getTitles(), getT()]);

  return (
    <AppShell title={t("nav.games")}>
      {result.ok ? (
        <TitlesView titles={result.data} />
      ) : (
        <SetupNotice title={t("catalogue.unavailable")} message={result.message} />
      )}
    </AppShell>
  );
}
