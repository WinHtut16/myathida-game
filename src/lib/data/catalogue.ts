import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { Pricing, Product, Tier } from "@/lib/types";

/** Server reads for the catalogue screens (Snacks, Pricing). */

interface ProductRow {
  id: string;
  name_en: string;
  name_my: string;
  category: Product["category"];
  price: number;
  stock: number | null;
  active: boolean;
}

interface PricingRow { tier: Tier; rate_per_hour: number; min_minutes: number }

export type CatalogueResult<T> = { ok: true; data: T } | { ok: false; message: string };

const UNCONFIGURED =
  "Supabase is not configured for this deployment. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DATA_SOURCE=supabase on the Vercel project myathida-game.";

const NOT_EXPOSED =
  "The `game` schema is not exposed to the API. Add it under Settings > API > Exposed schemas in the futsal Supabase project (mmyjtvlnuizpwktpkuij) and press Save.";

function explainRead(code: string | undefined, message: string): string {
  if (code === "PGRST106") return NOT_EXPOSED;
  return `Could not load (${code ?? "unknown"}). ${message}`;
}

/**
 * The full catalogue, INCLUDING delisted items - unlike the floor board, which
 * only fetches active ones. This is the screen where you put something back on
 * sale, so hiding what is off sale would hide the thing you came to fix.
 */
export async function getProducts(): Promise<CatalogueResult<Product[]>> {
  if (!isSupabaseConfigured()) return { ok: false, message: UNCONFIGURED };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id,name_en,name_my,category,price,stock,active")
    .order("category")
    .order("name_en");

  if (error) {
    console.error("[catalogue] products read failed", {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    });
    return { ok: false, message: explainRead(error.code, error.message) };
  }

  return {
    ok: true,
    data: (data as ProductRow[]).map((p) => ({
      id: p.id,
      nameEn: p.name_en,
      nameMy: p.name_my,
      category: p.category,
      price: Number(p.price),
      stock: p.stock,
      active: p.active,
    })),
  };
}

export async function getPricing(): Promise<CatalogueResult<Pricing[]>> {
  if (!isSupabaseConfigured()) return { ok: false, message: UNCONFIGURED };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing")
    .select("tier,rate_per_hour,min_minutes");

  if (error) {
    console.error("[catalogue] pricing read failed", {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    });
    return { ok: false, message: explainRead(error.code, error.message) };
  }

  const order: Tier[] = ["PS4", "PS5", "VIP"];
  return {
    ok: true,
    data: (data as PricingRow[])
      .map((p) => ({ tier: p.tier, ratePerHour: Number(p.rate_per_hour), minMinutes: p.min_minutes }))
      .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier)),
  };
}
