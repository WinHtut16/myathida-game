import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { TITLE_GENRES, type GameTitle, type TitleGenre, type TitlePlatform } from "@/lib/types";
import type { CatalogueResult } from "./catalogue";

/** Server read for the Games screen: every title, hidden ones included. */

interface TitleRow {
  id: string;
  title: string;
  platforms: string[];
  genre: string;
  max_players: number;
  cover_url: string | null;
  is_new: boolean;
  is_popular: boolean;
  visible: boolean;
  sort_order: number;
  description_en?: string | null;
  description_my?: string | null;
  local_coop?: boolean;
  online?: boolean;
  featured?: boolean;
}

const UNCONFIGURED =
  "Supabase is not configured for this deployment. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DATA_SOURCE=supabase on the Vercel project myathida-game.";

function mapRow(r: TitleRow): GameTitle {
  return {
    id: r.id,
    title: r.title,
    platforms: r.platforms.filter((p): p is TitlePlatform => p === "PS4" || p === "PS5"),
    genre: (TITLE_GENRES as readonly string[]).includes(r.genre) ? (r.genre as TitleGenre) : "other",
    maxPlayers: r.max_players,
    coverUrl: r.cover_url,
    isNew: r.is_new,
    isPopular: r.is_popular,
    visible: r.visible,
    sortOrder: r.sort_order,
    descriptionEn: r.description_en ?? null,
    descriptionMy: r.description_my ?? null,
    localCoop: r.local_coop ?? false,
    online: r.online ?? false,
    featured: r.featured ?? false,
  };
}

export async function getTitles(): Promise<CatalogueResult<GameTitle[]>> {
  if (!isSupabaseConfigured()) return { ok: false, message: UNCONFIGURED };

  const supabase = await createClient();
  const base = "id,title,platforms,genre,max_players,cover_url,is_new,is_popular,visible,sort_order";
  const details = ",description_en,description_my,local_coop,online,featured";
  const read = (cols: string) => supabase.from("titles").select(cols).order("sort_order").order("title");
  let res = await read(base + details);
  // 42703: game-titles-details-migration.sql not run yet. Keep the screen
  // working on the original columns; saving details will say what to run.
  if (res.error?.code === "42703") res = await read(base);
  const { data, error } = res;

  if (error) {
    // 42P01: the table is missing, i.e. game-titles-migration.sql not run yet.
    const message =
      error.code === "42P01" || error.code === "PGRST205"
        ? "The games list table does not exist yet. Run supabase/game-titles-migration.sql in the futsal Supabase project's SQL editor."
        : `Could not load (${error.code ?? "unknown"}). ${error.message}`;
    return { ok: false, message };
  }
  return { ok: true, data: (data as unknown as TitleRow[]).map(mapRow) };
}
