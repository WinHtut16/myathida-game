import type { Tier } from "@/lib/types";

/**
 * What a backup contains.
 *
 * Declarative on purpose: the fetch/paginate/write machinery in the route
 * handler knows nothing about the game shop, so adding a table is a row here
 * rather than a change to the exporter. Same shape futsal uses.
 */
export type Col = { key: string; header: string; width?: number };

export type TableSpec = {
  sheet: string;
  table: string;
  orderCol: string;
  /**
   * null = snapshot table, always exported whole. Current state (prices,
   * stock, who works here) is what you need to REBUILD the shop, so cutting it
   * to a date window would produce a backup that cannot be restored from.
   */
  filter: { col: string } | null;
  columns: Col[];
};

export const SPECS: TableSpec[] = [
  {
    sheet: "Sessions",
    table: "sessions",
    orderCol: "created_at",
    filter: { col: "created_at" },
    columns: [
      { key: "id", header: "Session ID", width: 38 },
      { key: "created_at", header: "Recorded At", width: 24 },
      { key: "station_name", header: "Station", width: 12 },
      { key: "tier", header: "Tier", width: 8 },
      { key: "rate_per_hour", header: "Rate / hr", width: 12 },
      { key: "minutes", header: "Minutes", width: 10 },
      { key: "charged_minutes", header: "Charged Minutes", width: 16 },
      { key: "playtime_total", header: "Playtime", width: 12 },
      { key: "snacks_total", header: "Snacks", width: 12 },
      { key: "total", header: "Total", width: 12 },
      { key: "label", header: "Note", width: 20 },
      { key: "created_by", header: "Recorded By", width: 38 },
      // A backup that dropped these would show a corrected session as a
      // mysterious zero with no explanation.
      { key: "void_reason", header: "Correction Reason", width: 30 },
      { key: "voided_by", header: "Corrected By", width: 38 },
      { key: "voided_at", header: "Corrected At", width: 24 },
    ],
  },
  {
    sheet: "Order Lines",
    table: "order_lines",
    orderCol: "id",
    filter: null, // no timestamp of its own; scoped by its parent session
    columns: [
      { key: "id", header: "Line ID", width: 38 },
      { key: "session_id", header: "Session ID", width: 38 },
      { key: "product_name", header: "Product", width: 22 },
      { key: "qty", header: "Qty", width: 8 },
      { key: "unit_price", header: "Unit Price", width: 12 },
      { key: "line_total", header: "Line Total", width: 12 },
    ],
  },
  {
    sheet: "Stock Movements",
    table: "stock_movements",
    orderCol: "created_at",
    filter: { col: "created_at" },
    columns: [
      { key: "created_at", header: "When", width: 24 },
      { key: "product_id", header: "Product ID", width: 38 },
      { key: "change", header: "Change", width: 10 },
      { key: "reason", header: "Reason", width: 14 },
      { key: "session_id", header: "Session ID", width: 38 },
      { key: "note", header: "Note", width: 26 },
      { key: "created_by", header: "By", width: 38 },
    ],
  },
  {
    sheet: "Products",
    table: "products",
    orderCol: "name_en",
    filter: null,
    columns: [
      { key: "id", header: "Product ID", width: 38 },
      { key: "name_en", header: "Name", width: 22 },
      { key: "name_my", header: "Name (MY)", width: 22 },
      { key: "category", header: "Category", width: 12 },
      { key: "price", header: "Price", width: 12 },
      { key: "stock", header: "Stock", width: 10 },
      { key: "active", header: "On Sale", width: 10 },
    ],
  },
  {
    sheet: "Pricing",
    table: "pricing",
    orderCol: "tier",
    filter: null,
    columns: [
      { key: "tier", header: "Tier", width: 10 },
      { key: "rate_per_hour", header: "Rate / hr", width: 12 },
      { key: "min_minutes", header: "Minimum Minutes", width: 16 },
    ],
  },
  {
    sheet: "Stations",
    table: "stations",
    orderCol: "sort_order",
    filter: null,
    columns: [
      { key: "id", header: "Station ID", width: 38 },
      { key: "name", header: "Name", width: 14 },
      { key: "tier", header: "Tier", width: 8 },
      { key: "status", header: "Status", width: 14 },
      { key: "sort_order", header: "Order", width: 8 },
    ],
  },
  {
    sheet: "Staff",
    table: "staff",
    orderCol: "created_at",
    filter: null,
    columns: [
      { key: "id", header: "Staff ID", width: 38 },
      { key: "name", header: "Name", width: 22 },
      { key: "phone", header: "Phone", width: 16 },
      { key: "email", header: "Email", width: 26 },
      { key: "active", header: "Active", width: 10 },
      { key: "created_at", header: "Added At", width: 24 },
    ],
  },
];

export const EXPORT_SCOPES = ["all", "month", "range"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export type Bounds = { startDate: string; endDate: string } | null;

/** Myanmar is UTC+06:30 with no DST — see lib/data/reports.ts for why this matters. */
export const MY_OFFSET = "+06:30";

export type { Tier };
