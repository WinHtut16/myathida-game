"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/data/session";
import { TITLE_GENRES, type TitleGenre, type TitlePlatform } from "@/lib/types";

/**
 * Writes for the Games screen (game.titles). Any active game staff may make
 * them; RLS (titles_write_staff) is the real boundary, and as in catalogue.ts
 * every write asks for its rows back so an RLS refusal is not reported as a
 * save.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export interface TitleInput {
  id?: string;
  title: string;
  platforms: TitlePlatform[];
  genre: TitleGenre;
  maxPlayers: number;
  coverUrl: string | null;
  isNew: boolean;
  isPopular: boolean;
  descriptionEn: string;
  descriptionMy: string;
  localCoop: boolean;
  online: boolean;
  featured: boolean;
}

const DENIED = "You need game staff access to change the games list.";

function explain(code: string | undefined, message: string): string {
  switch (code) {
    case "42501":
      return DENIED;
    case "23505":
      return "That game is already on the list.";
    case "23514":
      return "Check the details: a title, at least one console, 1 to 4 players, and descriptions under 400 characters.";
    case "42703":
      return "The database is missing the new game fields. Run supabase/game-titles-details-migration.sql in the Supabase SQL editor, then save again.";
    default:
      return `Could not save${code ? ` (${code})` : ""}. ${message}`;
  }
}

/**
 * Tell the park site (hub) that the games list changed, so /games shows it on
 * the next load instead of after its 60 s cache. Best-effort: a missing env
 * var, a slow hub or an error never fails the save. HUB_ORIGIN is the hub's
 * public origin; PARK_REVALIDATE_SECRET must match the hub's.
 */
async function pingPark(): Promise<void> {
  const origin = process.env.HUB_ORIGIN;
  const secret = process.env.PARK_REVALIDATE_SECRET;
  if (!origin || !secret) return;
  try {
    await fetch(`${origin.replace(/\/$/, "")}/api/park/revalidate-games`, {
      method: "POST",
      headers: { "x-park-revalidate": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // The park page still catches up within a minute on its own.
  }
}

async function done(): Promise<ActionResult> {
  revalidatePath("/titles");
  await pingPark();
  return { ok: true };
}

export async function upsertTitleAction(input: TitleInput): Promise<ActionResult> {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) return { ok: false, message: "A game needs a title." };
  if (title.length > 80) return { ok: false, message: "Keep the title under 80 characters." };
  const platforms = Array.from(new Set(input.platforms)).filter((p) => p === "PS4" || p === "PS5");
  if (platforms.length === 0) return { ok: false, message: "Pick PS4, PS5 or both." };
  if (!(TITLE_GENRES as readonly string[]).includes(input.genre)) return { ok: false, message: "Pick a genre." };
  const maxPlayers = Math.round(input.maxPlayers);
  if (!(maxPlayers >= 1 && maxPlayers <= 4)) return { ok: false, message: "Players must be 1 to 4." };
  const descriptionEn = input.descriptionEn.trim();
  const descriptionMy = input.descriptionMy.trim();
  if (descriptionEn.length > 400 || descriptionMy.length > 400) {
    return { ok: false, message: "Keep each description under 400 characters." };
  }
  if (input.coverUrl && !input.coverUrl.startsWith("https://res.cloudinary.com/")) {
    return { ok: false, message: "Upload the cover here; links to other sites are not shown on the park page." };
  }

  const supabase = await createClient();
  const row = {
    title,
    platforms,
    genre: input.genre,
    max_players: maxPlayers,
    cover_url: input.coverUrl,
    is_new: input.isNew,
    is_popular: input.isPopular,
    description_en: descriptionEn || null,
    description_my: descriptionMy || null,
    local_coop: input.localCoop,
    online: input.online,
    featured: input.featured,
  };

  let query;
  if (input.id) {
    query = supabase.from("titles").update(row).eq("id", input.id).select("id");
  } else {
    // New games go to the end of the list.
    const { data: last } = await supabase
      .from("titles")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const sortOrder = (last?.[0]?.sort_order ?? 0) + 10;
    query = supabase.from("titles").insert({ ...row, sort_order: sortOrder, visible: true }).select("id");
  }

  const { data, error } = await query;
  if (error) return { ok: false, message: explain(error.code, error.message) };
  if (!data || data.length === 0) return { ok: false, message: DENIED };
  return done();
}

export async function setTitleVisibleAction(id: string, visible: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("titles").update({ visible }).eq("id", id).select("id");
  if (error) return { ok: false, message: explain(error.code, error.message) };
  if (!data || data.length === 0) return { ok: false, message: DENIED };
  return done();
}

export async function deleteTitleAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("titles").delete().eq("id", id).select("id");
  if (error) return { ok: false, message: explain(error.code, error.message) };
  if (!data || data.length === 0) return { ok: false, message: DENIED };
  return done();
}

/**
 * Saves a new display order. Takes the full ordered id list from the screen
 * and rewrites sort_order in steps of 10, so gaps and ties left by earlier
 * edits are healed on the first move.
 */
export async function reorderTitlesAction(orderedIds: string[]): Promise<ActionResult> {
  if (orderedIds.length === 0 || orderedIds.length > 500) return { ok: false, message: "Nothing to reorder." };
  const supabase = await createClient();
  for (const [i, id] of orderedIds.entries()) {
    const { data, error } = await supabase
      .from("titles")
      .update({ sort_order: (i + 1) * 10 })
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, message: explain(error.code, error.message) };
    if (!data || data.length === 0) return { ok: false, message: DENIED };
  }
  return done();
}

/**
 * Cover upload to Cloudinary (the same account the futsal site uses for news
 * images; res.cloudinary.com is already allowed by the park page's CSP). The
 * browser shrinks the photo to a small WebP/JPEG first, so the request stays
 * well under the Server Action body limit. Signed upload over plain fetch:
 * no SDK, and the secret never leaves the server.
 */
export async function uploadCoverAction(form: FormData): Promise<ActionResult & { url?: string }> {
  // Upload is not a database write, so RLS cannot guard it; check here.
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: DENIED };

  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) {
    return {
      ok: false,
      message:
        "Cover upload is not set up on this deployment. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to the myathida-game Vercel project. You can still save the game without a cover.",
    };
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return { ok: false, message: "No image received." };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { ok: false, message: "Use a JPEG, PNG or WebP image." };
  if (file.size > 900_000) return { ok: false, message: "That image is too large. Try a smaller photo." };

  const folder = "myathida-game/titles";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");

  const body = new FormData();
  body.append("file", file);
  body.append("api_key", key);
  body.append("timestamp", timestamp);
  body.append("folder", folder);
  body.append("signature", signature);

  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
    const json = (await res.json()) as { secure_url?: string; error?: { message?: string } };
    if (!res.ok || !json.secure_url) {
      return { ok: false, message: `Upload failed. ${json.error?.message ?? ""}`.trim() };
    }
    return { ok: true, url: json.secure_url };
  } catch {
    return { ok: false, message: "Upload failed. Check the connection and try again." };
  }
}
