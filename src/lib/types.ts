// Domain types — mirror the Supabase schema.
//
// A session used to be only a completed record typed in after the customer
// left. It can now also be LIVE: staff start it, add snacks while the customer
// plays, and close it to take payment. Both paths still exist - staff forget to
// press Start, and a session nobody can record is revenue nobody can see.

/** Pricing tier. VIP is a PS5 in the VIP room at a higher rate. */
export type Tier = "PS4" | "PS5" | "VIP";

export type Role = "superadmin" | "admin";

export type ProductCategory = "snack" | "drink";

export type Locale = "en" | "my";

export type PaymentMethod = "cash" | "kbzpay" | "wave" | "other";

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
  /**
   * Whether the TV is in use. No longer independent truth: game.open_session
   * and game.close_session maintain it, and game.set_occupied refuses to
   * contradict a live session. Staff may still toggle it manually on a free
   * station to mark a TV busy without billing anyone.
   */
  occupied: boolean;
  sortOrder: number;
}

export interface Pricing {
  tier: Tier;
  ratePerHour: number; // MMK/hr
  minMinutes: number; // minimum charged minutes (configurable; default 30)
  /**
   * Block size and grace period for a LIVE session, matching billiards
   * (10 and 5). Elapsed time rounds up to a whole block once the grace is
   * spent, so 62 minutes bills as 60 rather than 70. Per tier, so the VIP room
   * can bill in different blocks from a PS4.
   */
  incrementMinutes: number;
  graceMinutes: number;
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

/** A snack/drink line attached to a session, live or recorded. */
export interface OrderLine {
  /** Present for a live session, where a line can still be removed. */
  id?: string;
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
  /** 'closed' for every historical row; 'active' only while one is running. */
  status: "active" | "closed";
  startedAt: string | null; // null for rows typed in before live sessions existed
  endedAt: string | null;
  paymentMethod: PaymentMethod | null;
  waivedMinutes: number;
  createdBy: string;
  createdAt: string; // ISO
  /** Set when the session was corrected. The row is kept and its charge zeroed. */
  voidReason: string | null;
  voidedAt: string | null;
}

/**
 * A session that is running right now.
 *
 * It has no totals yet - that is the point, and why the columns are nullable in
 * the database. The bill is derived from startedAt on every render rather than
 * stored anywhere, so a reload, a second device, or a staff member going home
 * all show the same number.
 */
export interface ActiveSession {
  id: string;
  stationId: string;
  stationName: string;
  tier: Tier;
  ratePerHour: number; // snapshot, so a mid-session price change cannot move the bill
  startedAt: string; // ISO, from the server — never a client clock
  label: string | null;
  orders: OrderLine[];
}

/** Station joined with derived floor state — what the occupancy board renders. */
export interface StationView {
  station: Station;
  occupied: boolean;
  rate: number;
  pricing: Pricing;
  /** Null when the TV is free, or occupied only by the manual flag. */
  active: ActiveSession | null;
}
