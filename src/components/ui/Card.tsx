import { cx } from "@/lib/ui";

/** Matches the card recipe already used across station/reports/catalogue
 * screens (`bg-surface border border-line rounded-[11px]`) and mirrored by
 * Skeleton.tsx's SkeletonCard, so a loading state and its resolved content
 * line up pixel for pixel. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("bg-surface border border-line rounded-[11px] p-[18px]", className)}>
      {children}
    </div>
  );
}
