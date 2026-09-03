"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Cookie, LayoutDashboard, Settings, MoreHorizontal } from "lucide-react";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { Sheet } from "@/components/ui/Sheet";
import { MoreMenu } from "./MoreMenu";

// The 4 daily destinations, same for both roles — pricing and export
// (superadmin-only) live in the More sheet instead, same as the account
// link, audit log, business switcher, language and sign-out. See
// DESIGN.md's Nav section: max 5 tabs, 4 primary + More.
const NAV_PRIMARY = [
  { href: "/floor", key: "nav.floor" as const, icon: LayoutDashboard, match: (p: string) => p === "/floor" },
  { href: "/reports", key: "nav.history" as const, icon: BarChart3, match: (p: string) => p.startsWith("/reports") },
  { href: "/products", key: "nav.snacks" as const, icon: Cookie, match: (p: string) => p.startsWith("/products") },
  { href: "/settings", key: "nav.settings" as const, icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

/** Mobile-only bottom nav, replacing the sidebar below `md:`. This app had
 * no responsive nav at all before — see DESIGN.md. */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useT();
  const [more, setMore] = useState(false);

  return (
    <>
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-[var(--z-nav)] grid grid-cols-5 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]"
        style={{ height: "var(--bottomnav-h)" }}
      >
        {NAV_PRIMARY.map(({ href, key, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              className={cx(
                "flex flex-col items-center justify-center gap-0.5",
                active ? "text-accent" : "text-text-muted"
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
              <span className="text-[10px] font-semibold">{t(key)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMore(true)}
          className={cx("flex flex-col items-center justify-center gap-0.5", more ? "text-accent" : "text-text-muted")}
        >
          <MoreHorizontal size={20} strokeWidth={1.9} />
          <span className="text-[10px] font-semibold">{t("nav.more")}</span>
        </button>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title={t("nav.more")} className="max-h-[80vh] overflow-y-auto">
        <MoreMenu onNavigate={() => setMore(false)} />
      </Sheet>
    </>
  );
}
