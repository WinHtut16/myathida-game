/** Amber count pill on a nav item (pending reward requests). "99+" past 99. */
export function PendingBadge({ count }: { count: number }) {
  return (
    <span
      className="ml-auto min-w-[20px] rounded-full bg-status-warn-bg px-1.5 py-px text-center text-2xs font-bold tabular-nums text-status-warn-deep"
      aria-label={`${count} pending`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
