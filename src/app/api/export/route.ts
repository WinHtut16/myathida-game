import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { SPECS, MY_OFFSET, type Bounds, type TableSpec } from "@/lib/data/export-spec";

// exceljs needs Node APIs; the edge runtime cannot build the workbook.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = 1000;

/**
 * The whole shop as a spreadsheet.
 *
 * Deliberately uses the SIGNED-IN client, not the service role. RLS already
 * lets active staff read these tables, so service-role would buy nothing
 * except a key on a path that streams every row of the business - and the
 * superadmin check below would become the only thing standing between a bug
 * and a full data dump. Here, a mistake in that check still leaves RLS
 * underneath it.
 */

function yangonToday(): string {
  const shifted = new Date(Date.now() + (6 * 60 + 30) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The client is pinned to the `game` schema, so its type is not the generic
 * SupabaseClient<"public">. Derived from createClient() rather than restated,
 * so it follows if the schema pin ever moves.
 */
type GameClient = Awaited<ReturnType<typeof createClient>>;

async function fetchAll(
  db: GameClient,
  spec: TableSpec,
  bounds: Bounds,
): Promise<Record<string, unknown>[]> {
  const select = spec.columns.map((c) => c.key).join(",");
  const rows: Record<string, unknown>[] = [];

  // Paged rather than one big select: a shop with a year of trading will
  // outgrow PostgREST's default row cap, and a backup that silently stops at
  // 1000 rows is worse than no backup at all.
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from(spec.table)
      .select(select)
      .order(spec.orderCol, { ascending: true })
      .range(from, from + PAGE - 1);

    if (bounds && spec.filter) {
      // Boundaries anchored to Myanmar-local midnight, so "September" means
      // September in the shop, not in UTC.
      q = q
        .gte(spec.filter.col, `${bounds.startDate}T00:00:00${MY_OFFSET}`)
        .lt(spec.filter.col, `${bounds.endDate}T00:00:00${MY_OFFSET}`);
    }

    const { data, error } = await q;
    if (error) throw new Error(`${spec.table}: ${error.message}`);
    const page = (data as unknown as Record<string, unknown>[]) ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: isSuper, error: superError } = await supabase.rpc("is_superadmin");
  if (superError) {
    console.error("[export] is_superadmin failed", {
      code: superError.code, message: superError.message,
    });
    // Deny on a failed check, never allow.
    return NextResponse.json({ error: "Could not verify permissions." }, { status: 500 });
  }
  if (isSuper !== true) {
    return NextResponse.json(
      { error: "Only a superadmin can export the shop's data." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all";

  let bounds: Bounds = null;
  let stamp: string;
  let scopeLabel: string;

  if (scope === "month") {
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month"));
    if (!Number.isInteger(year) || year < 2020 || year > 2100 ||
        !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Pick a valid month and year." }, { status: 400 });
    }
    const m = String(month).padStart(2, "0");
    bounds = {
      startDate: `${year}-${m}-01`,
      endDate: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    };
    stamp = `${year}-${m}`;
    scopeLabel = `Month: ${year}-${m}`;
  } else if (scope === "range") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (!isDate(from) || !isDate(to) || from > to) {
      return NextResponse.json({ error: "Pick a valid date range." }, { status: 400 });
    }
    // `to` inclusive: a person picking 1st–30th means the 30th included.
    bounds = { startDate: from, endDate: addDays(to, 1) };
    stamp = `${from}_${to}`;
    scopeLabel = `Range: ${from} to ${to}`;
  } else {
    stamp = yangonToday();
    scopeLabel = "All time (full backup)";
  }

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MyaThida Game Shop";
    workbook.created = new Date();

    // Added first so it lands as the first tab; filled in once counts exist.
    const readme = workbook.addWorksheet("README");

    const counts: { sheet: string; count: number; scoped: boolean }[] = [];
    for (const spec of SPECS) {
      const ws = workbook.addWorksheet(spec.sheet);
      ws.columns = spec.columns.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width ?? 18,
      }));
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];

      const data = await fetchAll(supabase, spec, bounds);
      for (const row of data) {
        ws.addRow(spec.columns.map((c) => row[c.key] ?? null));
      }
      counts.push({ sheet: spec.sheet, count: data.length, scoped: !!spec.filter });
    }

    readme.columns = [
      { header: "Field", key: "field", width: 26 },
      { header: "Value", key: "value", width: 52 },
    ];
    readme.getRow(1).font = { bold: true };
    readme.addRow({ field: "Business", value: "MyaThida Game Shop" });
    readme.addRow({ field: "Generated", value: new Date().toISOString() });
    readme.addRow({ field: "Scope", value: scopeLabel });
    readme.addRow({ field: "Generated by", value: auth.user.email ?? auth.user.id });
    readme.addRow({ field: "", value: "" });
    readme.addRow({ field: "Sheet", value: "Rows" });
    for (const c of counts) {
      readme.addRow({
        field: c.sheet,
        value: `${c.count}${c.scoped ? "" : "  (full snapshot, not date-filtered)"}`,
      });
    }
    readme.addRow({ field: "", value: "" });
    readme.addRow({
      field: "Note",
      value:
        "Prices, stock, stations and staff are exported in full whatever scope is chosen - they are current state, and a date-limited copy could not be restored from.",
    });
    readme.addRow({
      field: "Note",
      value:
        "A session with a Correction Reason had its charge zeroed. The row is kept on purpose; it is not an error.",
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `myathida-game-${stamp}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Never cached: it contains the whole business, and the zone sits
        // behind a CDN that has already served us a stale response once.
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[export] build failed", { scope, message });
    // 42P01 = table missing, i.e. a migration has not been run.
    if (message.includes("stock_movements")) {
      return NextResponse.json(
        {
          error:
            "Stock movements are not set up yet. Run supabase/game-corrections-migration.sql in the futsal Supabase project.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: `Could not build the export. ${message}` }, { status: 500 });
  }
}
