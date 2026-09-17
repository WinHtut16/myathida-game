import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getStaffDirectory } from "./staff-directory";
import { yangonDayStart } from "./yangon";
import type { Pricing, Product, Station, Tier } from "@/lib/types";

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

interface PricingRow {
  tier: Tier;
  rate_per_hour: number;
  min_minutes: number;
  increment_minutes: number;
  grace_minutes: number;
}

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
    .select("tier,rate_per_hour,min_minutes,increment_minutes,grace_minutes");

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
      .map((p) => ({
        tier: p.tier,
        ratePerHour: Number(p.rate_per_hour),
        minMinutes: p.min_minutes,
        incrementMinutes: p.increment_minutes,
        graceMinutes: p.grace_minutes,
      }))
      .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier)),
  };
}

interface StationRow {
  id: string;
  name: string;
  tier: Tier;
  status: Station["status"];
  occupied: boolean;
  sort_order: number;
}

/** The floor plan, for the Settings screen. Includes stations in maintenance. */
export async function getStations(): Promise<CatalogueResult<Station[]>> {
  if (!isSupabaseConfigured()) return { ok: false, message: UNCONFIGURED };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stations")
    .select("id,name,tier,status,occupied,sort_order")
    .order("sort_order");

  if (error) {
    console.error("[catalogue] stations read failed", {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    });
    return { ok: false, message: explainRead(error.code, error.message) };
  }

  return {
    ok: true,
    data: (data as StationRow[]).map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.tier,
      status: s.status,
      occupied: s.occupied,
      sortOrder: s.sort_order,
    })),
  };
}

export const STOCK_REASONS = ["sale", "restock", "adjustment", "void_return"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export function isStockReason(v: string | undefined): v is StockReason {
  return !!v && (STOCK_REASONS as readonly string[]).includes(v);
}

export interface StockMovement {
  id: string;
  productName: string;
  change: number;
  reason: StockReason;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface MovementRow {
  id: string;
  change: number;
  reason: StockMovement["reason"];
  note: string | null;
  created_by: string | null;
  created_at: string;
  products: { name_en: string } | null;
}

/**
 * Recent stock changes.
 *
 * The ledger existed for a while with nothing reading it, which is the worst
 * of both worlds - the writes cost something and answered nobody. This is the
 * screen that makes it worth having: when the shelf count disagrees with the
 * app, this is where you find out whether it was sold, restocked or corrected.
 */
export async function getStockMovements(
  limit = 40,
): Promise<CatalogueResult<StockMovement[]>> {
  if (!isSupabaseConfigured()) return { ok: false, message: UNCONFIGURED };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id,change,reason,note,created_by,created_at,products(name_en)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[catalogue] stock movements read failed", {
      code: error.code, message: error.message, details: error.details, hint: error.hint,
    });
    // 42P01: the table is missing, i.e. the corrections migration has not run.
    if (error.code === "42P01") {
      return {
        ok: false,
        message:
          "Stock history is not set up yet. Run supabase/game-corrections-migration.sql in the futsal Supabase project.",
      };
    }
    return { ok: false, message: explainRead(error.code, error.message) };
  }

  return {
    ok: true,
    data: (data as unknown as MovementRow[]).map(mapMovementRow),
  };
}

function mapMovementRow(m: MovementRow): StockMovement {
  return {
    id: m.id,
    productName: m.products?.name_en ?? "Deleted product",
    change: m.change,
    reason: m.reason,
    note: m.note,
    createdBy: m.created_by,
    createdAt: m.created_at,
  };
}

function explainMovementsRead(code: string | undefined, message: string): string {
  if (code === "42P01") {
    return "Stock history is not set up yet. Run supabase/game-corrections-migration.sql in the futsal Supabase project.";
  }
  return explainRead(code, message);
}

// ── full stock-movement browser ──────────────────────────────────────────────
// getStockMovements() is the short recent tail under the catalogue. This backs
// the dedicated /products/stock-history screen: one page at a time, narrowed by
// product / reason / date range, with an exact total for the pager. Filtering
// and paging happen in Postgres because this list is unbounded.

export const STOCK_HISTORY_PAGE_SIZE = 50;

export interface StockHistoryFilters {
  productId?: string;
  reason?: StockReason;
  from?: string; // YYYY-MM-DD, inclusive (local Yangon day)
  to?: string; // YYYY-MM-DD, inclusive (local Yangon day)
  page?: number; // 1-based
}

export interface StockHistoryData {
  ok: true;
  movements: StockMovement[];
  staffNames: Record<string, string>;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  products: { id: string; name: string }[];
}

export type StockHistoryResult = StockHistoryData | { ok: false; message: string };

export async function getStockHistory(
  filters: StockHistoryFilters,
): Promise<StockHistoryResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: UNCONFIGURED };

  const supabase = await createClient();
  const pageSize = STOCK_HISTORY_PAGE_SIZE;
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("stock_movements")
    .select("id,change,reason,note,created_by,created_at,products(name_en)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const fromInstant = filters.from ? yangonDayStart(filters.from) : null;
  const toInstant = filters.to ? yangonDayStart(filters.to) : null;
  if (fromInstant) query = query.gte("created_at", fromInstant.toISOString());
  if (toInstant) {
    query = query.lt("created_at", new Date(toInstant.getTime() + 86_400_000).toISOString());
  }
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.reason) query = query.eq("reason", filters.reason);

  const [movementsRes, productsRes, directory] = await Promise.all([
    query,
    getProducts(),
    getStaffDirectory(),
  ]);

  if (movementsRes.error) {
    console.error("[catalogue] stock history read failed", {
      code: movementsRes.error.code, message: movementsRes.error.message,
      details: movementsRes.error.details, hint: movementsRes.error.hint,
    });
    return { ok: false, message: explainMovementsRead(movementsRes.error.code, movementsRes.error.message) };
  }

  const staffNames: Record<string, string> = {};
  for (const row of directory ?? []) staffNames[row.id] = row.name;

  const movements = (movementsRes.data as unknown as MovementRow[]).map(mapMovementRow);
  const total = movementsRes.count ?? movements.length;

  return {
    ok: true,
    movements,
    staffNames,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    products: productsRes.ok
      ? productsRes.data.map((p) => ({ id: p.id, name: p.nameEn }))
      : [],
  };
}
