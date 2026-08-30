import type { Pricing, Product, Session, Staff, Station, Tier } from "@/lib/types";

/**
 * Data-access contract. The running app uses the in-memory mock store
 * (./store.tsx). To go live, implement this against Supabase and switch the
 * provider — the UI is agnostic to the source.
 *
 * Note: createAdmin needs Supabase's service-role key and therefore must run in
 * a server context (route handler / server action / Edge Function), never the
 * browser. Superadmins are created by hand in the Supabase dashboard.
 */
export interface Repository {
  // reads
  listStaff(): Promise<Staff[]>;
  listStations(): Promise<Station[]>;
  listPricing(): Promise<Pricing[]>;
  listProducts(): Promise<Product[]>;
  listSessions(): Promise<Session[]>; // history

  // occupancy board
  setOccupied(stationId: string, occupied: boolean): Promise<void>;
  setStationStatus(stationId: string, status: Station["status"]): Promise<void>;

  // record a completed session
  recordSession(input: {
    stationId: string;
    minutes: number;
    items: { productId: string; qty: number }[];
    label: string | null;
  }): Promise<Session>;

  // admin
  upsertProduct(product: Product): Promise<Product>;
  updatePricing(tier: Tier, patch: Partial<Pricing>): Promise<Pricing>;
  upsertStation(station: Station): Promise<Station>;

  // account management (server-side / service role)
  createAdmin(input: { name: string; phone: string; password: string }): Promise<Staff>;
  setAdminActive(id: string, active: boolean): Promise<void>;
}
