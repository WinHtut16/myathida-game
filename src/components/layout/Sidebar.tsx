"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Cookie, Database, Gamepad2, LayoutDashboard, Settings, Star, Tag, User } from "lucide-react";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { SidebarFooter } from "./SidebarFooter";
import { PendingBadge } from "./PendingBadge";
import { usePendingPoints } from "@/lib/hooks/usePendingPoints";
import acjMark from "@/assets/acj-mark-mint.png";

// Paths are relative to this app's basePath (/admin/game), which Next adds to
// <Link href> and strips from usePathname() automatically - so these stay
// unprefixed and the same strings work standalone and behind the hub rewrite.
const NAV = [
  { href: "/floor", key: "nav.floor" as const, icon: LayoutDashboard, super: false, match: (p: string) => p === "/floor" },
  { href: "/reports", key: "nav.history" as const, icon: BarChart3, super: false, match: (p: string) => p.startsWith("/reports") },
  { href: "/products", key: "nav.snacks" as const, icon: Cookie, super: false, match: (p: string) => p.startsWith("/products") },
  { href: "/titles", key: "nav.games" as const, icon: Gamepad2, super: false, match: (p: string) => p.startsWith("/titles") },
  { href: "/points", key: "nav.points" as const, icon: Star, super: false, match: (p: string) => p.startsWith("/points") },
  { href: "/pricing", key: "nav.pricing" as const, icon: Tag, super: true, match: (p: string) => p.startsWith("/pricing") },
  { href: "/settings", key: "nav.settings" as const, icon: Settings, super: false, match: (p: string) => p.startsWith("/settings") },
  { href: "/export", key: "nav.export" as const, icon: Database, super: true, match: (p: string) => p.startsWith("/export") },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useT();

  /**
   * The real signed-in person, resolved on the server. This decides what the
   * nav SHOWS; it never decides what is allowed. Hiding the Pricing link from
   * a plain admin is a courtesy - the database refuses their write either way,
   * which is the check that actually counts.
   */
  const user = useCurrentUser();
  const superadmin = user?.isSuperadmin ?? false;
  const pending = usePendingPoints(!!user);

  return (
    <div className="hidden md:flex md:flex-col w-[216px] bg-rail text-rail-text flex-none py-[18px]">
      <div className="px-5 pb-5 flex items-center gap-2.5 border-b border-rail-line mb-3">
        {/* The client's ACJ mark in brand mint (same file as the hub's /games page). */}
        <Image src={acjMark} alt="" width={34} height={23} priority className="flex-none" />
        <div className="leading-[1.1]">
          <div className="text-white font-semibold text-base">AcJ Gaming Lounge</div>
          <div className="text-2xs text-rail-faint font-semibold tracking-caps">{t("brand.tagline")}</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.filter((n) => !n.super || superadmin).map(({ href, key, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              /**
               * Prefetch the target's loading.tsx boundary so its skeleton
               * paints instantly on click, instead of the page popping in only
               * when the Sydney round-trip happens to be slow.
               *
               * Off on /floor only: useAutoRefresh re-runs router.refresh()
               * every 10s there, and each pass re-prefetched all of these — 30
               * extra requests a minute, and it once buried a real error under
               * 1018 cached-404 console lines. useAutoRefresh is mounted
               * nowhere else, so every other screen prefetches safely.
               */
              prefetch={pathname === "/floor" ? false : undefined}
              className={cx(
                "flex items-center gap-[11px] px-3 py-2.5 rounded-md text-sm transition-colors",
                active ? "bg-accent text-white font-medium" : "hover:bg-rail-hover",
              )}
            >
              <Icon size={17} />
              {t(key)}
              {href === "/points" && pending ? <PendingBadge count={pending} /> : null}
            </Link>
          );
        })}
      </nav>

      <SidebarFooter />

    </div>
  );
}
