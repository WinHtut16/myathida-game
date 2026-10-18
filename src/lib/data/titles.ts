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
  };
}

export async function getTitles(): Promise<CatalogueResult<GameTitle[]>> {
  if (!isSupabaseConfigured()) return { ok: false, message: UNCONFIGURED };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("titles")
    .select("id,title,platforms,genre,max_players,cover_url,is_new,is_popular,visible,sort_order")
    .order("sort_order")
    .order("title");

  if (error) {
    // 42P01: the table is missing, i.e. game-titles-migration.sql not run yet.
    const message =
      error.code === "42P01" || error.code === "PGRST205"
        ? "The games list table does not exist yet. Run supabase/game-titles-migration.sql in the futsal Supabase project's SQL editor."
        : `Could not load (${error.code ?? "unknown"}). ${error.message}`;
    return { ok: false, message };
  }
  return { ok: true, data: (data as TitleRow[]).map(mapRow) };
}
