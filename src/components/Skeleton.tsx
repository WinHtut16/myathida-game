/**
 * Loading skeletons.
 *
 * Every route in this app is force-dynamic and every render waits on Supabase
 * in Sydney, so a navigation has real latency behind it - roughly a round trip
 * for the shell plus one for the screen's own data. Without a placeholder the
 * browser sits on the old page doing nothing visible, which reads as "the app
 * has frozen" rather than "this is loading".
 *
 * These render inside AppShell, so the sidebar and header stay put and only
 * the content area changes. That is the point: a skeleton that replaces the
 * whole screen, chrome included, is a flash, not a loading state.
 *
 * Shapes deliberately mirror the real content - same tile grid, same number of
 * rows - so the layout does not jump when the data lands.
 */

export function Bar({ w = "100%", h = 12 }: { w?: string; h?: number }) {
  return (
    <div
      className="rounded bg-line-faint animate-pulse"
      style={{ width: w, height: h }}
    />
  );
}

export function SkeletonCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-[11px] p-[18px]">{children}</div>
  );
}

export function TileRow({ count = 4 }: { count?: number }) {
  // Mirrors the real headline-figures grid, which is 2 columns below lg and
  // `count` columns from lg up. See DESIGN.md - loading state matches the
  // real layout exactly.
  return (
    <div className={`grid grid-cols-2 gap-3 ${count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-line rounded-[11px] p-4 px-[18px]">
          <Bar w="52%" h={10} />
          <div className="mt-3">
            <Bar w="72%" h={22} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A plot-shaped block: title line, then bars of varied height. */
export function ChartCard() {
  const heights = [46, 72, 58, 88, 40, 66, 78];
  return (
    <SkeletonCard>
      <Bar w="38%" h={12} />
      <div className="flex items-end gap-2 mt-5 h-[108px]">
        {heights.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-line-faint animate-pulse"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </SkeletonCard>
  );
}

export function ListCard({ rows = 5 }: { rows?: number }) {
  return (
    <SkeletonCard>
      <Bar w="38%" h={12} />
      <div className="flex flex-col gap-3 mt-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bar w="82px" h={12} />
            <div className="flex-1">
              <Bar w={`${90 - i * 13}%`} h={16} />
            </div>
            <Bar w="64px" h={12} />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

export function TableCard({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-line rounded-[11px] overflow-hidden">
      <div className="p-[18px]">
        <Bar w="26%" h={12} />
      </div>
      <div className="border-t border-line-faint">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 px-[18px] py-3.5 md:grid md:grid-cols-[1.5fr_1fr_.8fr_.9fr_.9fr_.5fr] md:gap-3 md:items-center border-b border-line-hair last:border-0"
          >
            <Bar w="76%" h={12} />
            <div className="hidden md:block"><Bar w="52%" h={12} /></div>
            <div className="hidden md:block"><Bar w="44%" h={12} /></div>
            <div className="hidden md:block"><Bar w="44%" h={12} /></div>
            <div className="hidden md:block"><Bar w="56%" h={12} /></div>
            <div className="hidden md:block"><Bar w="16px" h={12} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The floor board is a grid of station tiles. */
export function TileGrid({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 max-w-[1200px]">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface border border-line rounded-[10px] p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <Bar w="42%" h={15} />
            <Bar w="34px" h={15} />
          </div>
          <Bar w="58%" h={11} />
          <div className="mt-1 flex flex-col gap-2">
            <Bar h={32} />
            <Bar h={36} />
          </div>
        </div>
      ))}
    </div>
  );
}
