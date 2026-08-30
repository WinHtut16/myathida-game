import { TriangleAlert } from "lucide-react";
import { getFloorData } from "@/lib/data/floor";
import { FloorBoard } from "@/components/station/FloorBoard";

/**
 * The floor board: a SERVER component.
 *
 * It reads from Supabase here, on the server, and hands plain data to the
 * client shell. That is not a stylistic preference - Myanmar ISPs block
 * *.supabase.co, so a browser-side read works perfectly in development and
 * fails for the shop staff who actually use this. Keeping the fetch on the
 * server means the browser only ever talks to our own origin.
 */

// Occupancy changes constantly and two staff share this screen, so a cached
// render would show one of them a floor that is already wrong.
export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const data = await getFloorData();

  if (!data.ok) {
    return <SetupNotice message={data.message} />;
  }

  return (
    <FloorBoard
      stations={data.stations}
      pricing={data.pricing}
      products={data.products}
    />
  );
}

/**
 * Shown instead of the board when the app cannot read its own data.
 *
 * Deliberately not a blank screen or a spinner: the two ways this fails on
 * first run - a schema that was toggled but never saved, and an account with a
 * grant but no game.staff row - both look identical to "loading forever" and
 * neither is guessable. Naming the fix here saves an hour of looking in the
 * wrong place.
 */
function SetupNotice({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-6">
      <div className="max-w-[540px] w-full bg-surface border border-line rounded-xl shadow-card p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-8 h-8 rounded-lg bg-[#fdf3f1] text-[#8a3324] flex items-center justify-center flex-none">
            <TriangleAlert size={17} />
          </span>
          <h1 className="text-[17px] font-bold m-0">Game shop is not ready yet</h1>
        </div>
        <p className="text-[13.5px] text-text-secondary leading-relaxed m-0">{message}</p>
      </div>
    </div>
  );
}
