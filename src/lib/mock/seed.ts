import type { Pricing, Product, Session, Staff, Station } from "@/lib/types";

export interface AppData {
  staff: Staff[];
  stations: Station[];
  pricing: Pricing[];
  products: Product[];
  sessions: Session[];
}

const min = (n: number) => n * 60_000;

/** Demo dataset: 7×PS4, 2×PS5, 1×VIP; a couple of recorded sessions. */
export function buildSeed(base: number = Date.now()): AppData {
  const iso = (ms: number) => new Date(ms).toISOString();

  const staff: Staff[] = [
    { id: "u_super", name: "Su Su", phone: null, email: "owner@myathida.app", role: "superadmin", active: true, createdBy: null },
    { id: "u_admin", name: "Aung Kyaw", phone: "+959770000001", email: null, role: "admin", active: true, createdBy: "u_super" },
  ];

  const stations: Station[] = [
    { id: "st1", name: "TV 1", tier: "PS4", status: "available", occupied: true, sortOrder: 1 },
    { id: "st2", name: "TV 2", tier: "PS4", status: "available", occupied: false, sortOrder: 2 },
    { id: "st3", name: "TV 3", tier: "PS4", status: "available", occupied: true, sortOrder: 3 },
    { id: "st4", name: "TV 4", tier: "PS4", status: "available", occupied: false, sortOrder: 4 },
    { id: "st5", name: "TV 5", tier: "PS4", status: "available", occupied: false, sortOrder: 5 },
    { id: "st6", name: "TV 6", tier: "PS4", status: "maintenance", occupied: false, sortOrder: 6 },
    { id: "st7", name: "TV 7", tier: "PS4", status: "available", occupied: true, sortOrder: 7 },
    { id: "st8", name: "TV 8", tier: "PS5", status: "available", occupied: false, sortOrder: 8 },
    { id: "st9", name: "TV 9", tier: "PS5", status: "available", occupied: true, sortOrder: 9 },
    { id: "stvip", name: "VIP", tier: "VIP", status: "available", occupied: false, sortOrder: 10 },
  ];

  const pricing: Pricing[] = [
    { tier: "PS4", ratePerHour: 3000, minMinutes: 30 },
    { tier: "PS5", ratePerHour: 5000, minMinutes: 30 },
    { tier: "VIP", ratePerHour: 7000, minMinutes: 30 },
  ];

  const products: Product[] = [
    { id: "p_coke", nameEn: "Coca-Cola", nameMy: "ကိုကာကိုလာ", category: "drink", price: 1000, stock: 48, active: true },
    { id: "p_chips", nameEn: "Potato Chips", nameMy: "အာလူးကြော်", category: "snack", price: 1000, stock: 22, active: true },
    { id: "p_energy", nameEn: "Energy Drink", nameMy: "စွမ်းအင်အချိုရည်", category: "drink", price: 2000, stock: 12, active: true },
    { id: "p_noodles", nameEn: "Instant Noodles", nameMy: "ခေါက်ဆွဲ", category: "snack", price: 1500, stock: 10, active: true },
    { id: "p_choco", nameEn: "Chocolate Bar", nameMy: "ချောကလက်", category: "snack", price: 1200, stock: 15, active: true },
    { id: "p_peanut", nameEn: "Peanuts", nameMy: "မြေပဲ", category: "snack", price: 800, stock: 30, active: true },
    { id: "p_water", nameEn: "Water", nameMy: "သောက်ရေ", category: "drink", price: 500, stock: 60, active: true },
  ];

  // A few recorded history rows.
  const sessions: Session[] = [
    {
      id: "se_1001",
      stationId: "st8",
      stationName: "TV 8",
      tier: "PS5",
      ratePerHour: 5000,
      minutes: 90,
      chargedMinutes: 90,
      playtimeTotal: 7500,
      snacksTotal: 3000,
      total: 10500,
      label: "Ko Aung",
      orders: [
        { productId: "p_coke", productName: "Coca-Cola", qty: 2, unitPrice: 1000, lineTotal: 2000 },
        { productId: "p_chips", productName: "Potato Chips", qty: 1, unitPrice: 1000, lineTotal: 1000 },
      ],
      createdBy: "u_admin",
      createdAt: iso(base - min(140)),
    },
    {
      id: "se_1002",
      stationId: "st1",
      stationName: "TV 1",
      tier: "PS4",
      ratePerHour: 3000,
      minutes: 60,
      chargedMinutes: 60,
      playtimeTotal: 3000,
      snacksTotal: 800,
      total: 3800,
      label: null,
      orders: [{ productId: "p_peanut", productName: "Peanuts", qty: 1, unitPrice: 800, lineTotal: 800 }],
      createdBy: "u_admin",
      createdAt: iso(base - min(95)),
    },
    {
      id: "se_1003",
      stationId: "stvip",
      stationName: "VIP",
      tier: "VIP",
      ratePerHour: 7000,
      minutes: 120,
      chargedMinutes: 120,
      playtimeTotal: 14000,
      snacksTotal: 4000,
      total: 18000,
      label: "Group booking",
      orders: [
        { productId: "p_energy", productName: "Energy Drink", qty: 2, unitPrice: 2000, lineTotal: 4000 },
      ],
      createdBy: "u_super",
      createdAt: iso(base - min(50)),
    },
  ];

  return { staff, stations, pricing, products, sessions };
}
