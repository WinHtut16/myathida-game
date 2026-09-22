import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { ActiveSession, OrderLine, Pricing, Product, Station, StationView, Tier } from "@/lib/types";

/**
 * Server-side reads for the floor board.
 *
 * Every one of these runs on the server and returns plain data to a server
 * component. Nothing here may be imported from a "use client" file - the
 * `server-only` import above turns that into a build error rather than a
 * runtime surprise in Yangon.
 */

export type FloorData =
  | { ok: true; stations: StationView[]; pricing: Pricing[]; products: Product[] }
  | { ok: false; reason: "unconfigured" | "unauthorised"; message: string };

interface StationRow {
  id: string;
  name: string;
  tier: Tier;
  status: Station["status"];
  state: Station["state"];
  sort_order: number;
}

interface PricingRow {
  tier: Tier;
  rate_per_hour: number;
  min_minutes: number;
  increment_minutes: number;
  grace_minutes: number;
}

interface OrderLineRow {
  id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

interface ActiveSessionRow {
  id: string;
  station_id: string;
  station_name: string;
  tier: Tier;
  rate_per_hour: number;
  started_at: string;
  label: string | null;
  order_lines: OrderLineRow[] | null;
}

interface ProductRow {
  id: string;
  name_en: string;
  name_my: string;
  category: Product["category"];
  price: number;
  stock: number | null;
  active: boolean;
}

export async function getFloorData(): Promise<FloorData> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      reason: "unconfigured",
      message:
        "Supabase is not configured for this deployment. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DATA_SOURCE=supabase on the Vercel project myathida-game.",
    };
  }

  const supabase = await createClient();

  /**
   * One round trip per table rather than three sequential awaits. From sin1 to
   * the Sydney project each is ~95ms, so serialising them would put a third of
   * a second on every floor-board render for no reason.
   */
  const [stationsRes, pricingRes, productsRes, activeRes] = await Promise.all([
    supabase.from("stations").select("id,name,tier,status,state,sort_order").order("sort_order"),
    supabase.from("pricing").select("tier,rate_per_hour,min_minutes,increment_minutes,grace_minutes"),
    supabase.from("products").select("id,name_en,name_my,category,price,stock,active").eq("active", true),
    /**
     * The open sessions, with their snacks embedded in the same round trip.
     * At most one per station - a partial unique index guarantees it - so this
     * is a handful of rows however busy the shop gets.
     *
     * No totals are selected because an open session has none. The running
     * figure is derived from started_at on the client, so a reload or a second
     * device shows the same number instead of each keeping its own count.
     */
    supabase
      .from("sessions")
      .select(
        "id,station_id,station_name,tier,rate_per_hour,started_at,label," +
          "order_lines(id,product_id,product_name,qty,unit_price,line_total)",
      )
      .eq("status", "active"),
  ]);

  /**
   * Errors are read, not discarded.
   *
   * `const { data } = await supabase...` is the single most expensive habit in
   * this codebase's history: it throws away `error`, so a broken call and a
   * denied one look identical - an empty screen either way. Three separate
   * bugs across futsal and billiards each took hours longer to find for
   * exactly this reason. An RLS denial and a misspelled column must not arrive
   * here wearing the same clothes.
   */
  const failure = stationsRes.error ?? pricingRes.error ?? productsRes.error ?? activeRes.error;
  if (failure) {
    console.error("[floor] read failed", {
      code: failure.code,
      message: failure.message,
      details: failure.details,
      hint: failure.hint,
    });

    // PGRST106: the schema is not in Settings > API > Exposed schemas (or the
    // toggle was never saved). It presents as a 404 and looks like a missing
    // table, which sends you looking in entirely the wrong place.
    if (failure.code === "PGRST106") {
      return {
        ok: false,
        reason: "unconfigured",
        message:
          "The `game` schema is not exposed to the API. Add it under Settings > API > Exposed schemas in the futsal Supabase project (mmyjtvlnuizpwktpkuij) and press Save.",
      };
    }

    return {
      ok: false,
      reason: "unauthorised",
      message: `Could not load the floor (${failure.code ?? "unknown"}). ${failure.message}`,
    };
  }

  const pricing: Pricing[] = (pricingRes.data ?? []).map((p: PricingRow) => ({
    tier: p.tier,
    ratePerHour: Number(p.rate_per_hour),
    minMinutes: p.min_minutes,
    incrementMinutes: p.increment_minutes,
    graceMinutes: p.grace_minutes,
  }));

  /**
   * An empty station list with no error means RLS returned nothing: the person
   * is signed in but has no game grant, or has a game.staff row marked
   * inactive. Saying so beats rendering a convincing but empty shop floor.
   */
  if ((stationsRes.data ?? []).length === 0) {
    return {
      ok: false,
      reason: "unauthorised",
      message:
        "No stations are visible for this account. It needs a 'game' row in public.app_access and an active row in game.staff.",
    };
  }

  // A tier with no pricing row cannot be billed, so it gets a zeroed entry
  // rather than crashing the board. open_session refuses it server-side too.
  const fallback = (tier: Tier): Pricing => ({
    tier,
    ratePerHour: 0,
    minMinutes: 0,
    incrementMinutes: 10,
    graceMinutes: 0,
  });
  const pricingFor = (tier: Tier) => pricing.find((p) => p.tier === tier) ?? fallback(tier);

  const toOrderLine = (l: OrderLineRow): OrderLine => ({
    id: l.id,
    productId: l.product_id ?? "",
    productName: l.product_name,
    qty: l.qty,
    unitPrice: Number(l.unit_price),
    lineTotal: Number(l.line_total),
  });

  const activeByStation = new Map<string, ActiveSession>();
  for (const row of (activeRes.data ?? []) as unknown as ActiveSessionRow[]) {
    activeByStation.set(row.station_id, {
      id: row.id,
      stationId: row.station_id,
      stationName: row.station_name,
      tier: row.tier,
      ratePerHour: Number(row.rate_per_hour),
      startedAt: row.started_at,
      label: row.label,
      orders: (row.order_lines ?? []).map(toOrderLine),
    });
  }

  const stations: StationView[] = (stationsRes.data ?? []).map((s: StationRow) => ({
    station: {
      id: s.id,
      name: s.name,
      tier: s.tier,
      status: s.status,
      state: s.state,
      sortOrder: s.sort_order,
    },
    state: s.state,
    rate: pricingFor(s.tier).ratePerHour,
    pricing: pricingFor(s.tier),
    active: activeByStation.get(s.id) ?? null,
  }));

  const products: Product[] = (productsRes.data ?? []).map((p: ProductRow) => ({
    id: p.id,
    nameEn: p.name_en,
    nameMy: p.name_my,
    category: p.category,
    price: Number(p.price),
    stock: p.stock,
    active: p.active,
  }));

  return { ok: true, stations, pricing, products };
}
