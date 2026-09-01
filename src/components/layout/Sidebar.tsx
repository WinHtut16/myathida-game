"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Cookie, LayoutDashboard, Settings, Tag, User } from "lucide-react";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { SidebarFooter } from "./SidebarFooter";

// Paths are relative to this app's basePath (/admin/game), which Next adds to
// <Link href> and strips from usePathname() automatically - so these stay
// unprefixed and the same strings work standalone and behind the hub rewrite.
const NAV = [
  { href: "/floor", key: "nav.floor" as const, icon: LayoutDashboard, super: false, match: (p: string) => p === "/floor" },
  { href: "/reports", key: "nav.history" as const, icon: BarChart3, super: false, match: (p: string) => p.startsWith("/reports") },
  { href: "/products", key: "nav.snacks" as const, icon: Cookie, super: false, match: (p: string) => p.startsWith("/products") },
  { href: "/pricing", key: "nav.pricing" as const, icon: Tag, super: true, match: (p: string) => p.startsWith("/pricing") },
  { href: "/settings", key: "nav.settings" as const, icon: Settings, super: false, match: (p: string) => p.startsWith("/settings") },
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

  return (
    <div className="w-[216px] bg-rail text-[#c7cbd3] flex-none flex flex-col py-[18px]">
      <div className="px-5 pb-5 flex items-center gap-2.5 border-b border-[#34383f] mb-3">
        <span className="w-[30px] h-[30px] rounded-[7px] bg-accent flex items-center justify-center text-white font-mono font-bold text-[15px]">
          M
        </span>
        <div className="leading-[1.1]">
          <div className="text-white font-semibold text-[14.5px]">MyaThida</div>
          <div className="text-[10.5px] text-[#7d838e] font-mono">{t("brand.tagline")}</div>
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
               * Prefetch off. useAutoRefresh re-runs router.refresh() every 10s
               * and each pass re-prefetched all five of these, so one open tab
               * produced 30 extra requests a minute for navigations that are
               * cheap anyway. It also turned the cached-404 bug into 1018
               * console errors, which buried the one that mattered.
               */
              prefetch={false}
              className={cx(
                "flex items-center gap-[11px] px-3 py-2.5 rounded-[7px] text-sm",
                active ? "bg-accent text-white font-medium" : "hover:bg-[#2c3037]",
              )}
            >
              <Icon size={17} />
              {t(key)}
            </Link>
          );
        })}
      </nav>

      <SidebarFooter />

    </div>
  );
}
