// Domain types — mirror the Supabase schema in supabase/migrations/0001_init.sql.
//
// The app is a cost calculator + session-history recorder. Timing and TV power
// are handled externally (CozyLife app). A "session" here is a completed record
// entered after the customer finishes, not a live timer.

/** Pricing tier. VIP is a PS5 in the VIP room at a higher rate. */
export type Tier = "PS4" | "PS5" | "VIP";

export type Role = "superadmin" | "admin";

export type ProductCategory = "snack" | "drink";

export type Locale = "en" | "my";

export interface Staff {
  id: string;
  name: string;
  phone: string | null; // normal admins sign in by phone; superadmins by email
  email: string | null;
  role: Role;
  active: boolean;
  createdBy: string | null;
}

export interface Station {
  id: string;
  name: string; // "TV 1", "VIP"
  tier: Tier;
  status: "available" | "maintenance";
  occupied: boolean; // manual occupancy flag (staff toggles it)
  sortOrder: number;
}

export interface Pricing {
  tier: Tier;
  ratePerHour: number; // MMK/hr
  minMinutes: number; // minimum charged minutes (configurable; default 30)
}

export interface Product {
  id: string;
  nameEn: string;
  nameMy: string;
  category: ProductCategory;
  price: number;
  stock: number | null;
  active: boolean;
}

/** A snack/drink line attached to a recorded session. */
export interface OrderLine {
  productId: string;
  productName: string; // snapshot
  qty: number;
  unitPrice: number; // snapshot
  lineTotal: number;
}

/** A completed, recorded session. Immutable history row. */
export interface Session {
  id: string;
  stationId: string;
  stationName: string; // snapshot (station may be renamed later)
  tier: Tier;
  ratePerHour: number; // snapshot
  minutes: number; // actual entered duration
  chargedMinutes: number; // max(minutes, minMinutes)
  playtimeTotal: number;
  snacksTotal: number;
  total: number;
  label: string | null; // optional customer note
  orders: OrderLine[];
  createdBy: string;
  createdAt: string; // ISO
  /** Set when the session was corrected. The row is kept and its charge zeroed. */
  voidReason: string | null;
  voidedAt: string | null;
}

/** Station joined with derived floor state — what the occupancy board renders. */
export interface StationView {
  station: Station;
  occupied: boolean;
  rate: number;
}
