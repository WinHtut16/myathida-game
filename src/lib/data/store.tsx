"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { buildSeed, type AppData } from "@/lib/mock/seed";
import { computePlaytime, rateFor, snacksTotal } from "@/lib/pricing";
import type {
  OrderLine,
  Staff,
  Pricing,
  Product,
  Session,
  Station,
  StationView,
  Tier,
} from "@/lib/types";

/*
 * In-memory client store — single source of truth while running on mock data.
 * Every mutation mirrors a Supabase write; swap this for a repository-backed
 * provider to go live (see src/lib/data/repository.ts and README).
 */

/**
 * Demo DATA for the four screens not yet converted. Identity now comes from
 * SessionProvider and language from LocaleProvider, both resolved on the
 * server - this store no longer decides who you are or what language you read.
 */
interface State extends AppData {}

type Action =
  | { type: "SET_OCCUPIED"; stationId: string; occupied: boolean }
  | { type: "SET_STATION_STATUS"; stationId: string; status: Station["status"] }
  | { type: "RECORD_SESSION"; stationId: string; minutes: number; items: { product: Product; qty: number }[]; label: string | null }
  | { type: "UPSERT_PRODUCT"; product: Product }
  | { type: "TOGGLE_PRODUCT"; id: string }
  | { type: "UPDATE_PRICING"; tier: Tier; patch: Partial<Pricing> }
  | { type: "UPSERT_STATION"; station: Station }
  | { type: "CREATE_ADMIN"; name: string; phone: string }
  | { type: "TOGGLE_ADMIN"; id: string }
  ;

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

/** Demo rows need an author; the real one is auth.uid() server-side. */
const DEMO_AUTHOR = "u_super";

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_OCCUPIED":
      return {
        ...state,
        stations: state.stations.map((s) => (s.id === action.stationId ? { ...s, occupied: action.occupied } : s)),
      };

    case "SET_STATION_STATUS":
      return {
        ...state,
        stations: state.stations.map((s) => (s.id === action.stationId ? { ...s, status: action.status } : s)),
      };

    case "RECORD_SESSION": {
      const station = state.stations.find((s) => s.id === action.stationId);
      if (!station) return state;
      const pricing = rateFor(state.pricing, station.tier);
      const orders: OrderLine[] = action.items
        .filter((i) => i.qty > 0)
        .map((i) => ({
          productId: i.product.id,
          productName: i.product.nameEn,
          qty: i.qty,
          unitPrice: i.product.price,
          lineTotal: i.product.price * i.qty,
        }));
      const { chargedMinutes, total: playtimeTotal } = computePlaytime(action.minutes, pricing);
      const snacks = snacksTotal(orders);
      const session: Session = {
        id: uid("se"),
        stationId: station.id,
        stationName: station.name,
        tier: station.tier,
        ratePerHour: pricing.ratePerHour,
        minutes: action.minutes,
        chargedMinutes,
        playtimeTotal,
        snacksTotal: snacks,
        total: playtimeTotal + snacks,
        label: action.label,
        orders,
        createdBy: DEMO_AUTHOR,
        createdAt: new Date().toISOString(),
      };
      return {
        ...state,
        sessions: [session, ...state.sessions],
        // recording a finished session frees the TV
        stations: state.stations.map((s) => (s.id === station.id ? { ...s, occupied: false } : s)),
      };
    }

    case "UPSERT_PRODUCT": {
      const exists = state.products.some((p) => p.id === action.product.id);
      return {
        ...state,
        products: exists
          ? state.products.map((p) => (p.id === action.product.id ? action.product : p))
          : [...state.products, action.product],
      };
    }

    case "TOGGLE_PRODUCT":
      return { ...state, products: state.products.map((p) => (p.id === action.id ? { ...p, active: !p.active } : p)) };

    case "UPDATE_PRICING":
      return { ...state, pricing: state.pricing.map((p) => (p.tier === action.tier ? { ...p, ...action.patch } : p)) };

    case "UPSERT_STATION": {
      const exists = state.stations.some((s) => s.id === action.station.id);
      return {
        ...state,
        stations: exists
          ? state.stations.map((s) => (s.id === action.station.id ? action.station : s))
          : [...state.stations, action.station],
      };
    }

    case "CREATE_ADMIN": {
      const admin: Staff = {
        id: uid("u"),
        name: action.name,
        phone: action.phone,
        email: null,
        role: "admin",
        active: true,
        createdBy: DEMO_AUTHOR,
      };
      return { ...state, staff: [...state.staff, admin] };
    }

    case "TOGGLE_ADMIN":
      return { ...state, staff: state.staff.map((s) => (s.id === action.id ? { ...s, active: !s.active } : s)) };

    default:
      return state;
  }
}

interface StoreContextValue {
  state: State;
  dispatch: React.Dispatch<Action>;
  stationViews: StationView[];
  history: Session[];
  pricingFor: (t: Tier) => Pricing;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...buildSeed() }));

  const value = useMemo<StoreContextValue>(() => {
    const stationViews: StationView[] = state.stations
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((station) => ({
        station,
        occupied: station.occupied,
        rate: rateFor(state.pricing, station.tier).ratePerHour,
      }));

    return {
      state,
      dispatch,
      stationViews,
      history: state.sessions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      pricingFor: (t) => rateFor(state.pricing, t),
    };
  }, [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>");
  return ctx;
}
