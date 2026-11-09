"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gift, Inbox, Users } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";

const TABS = [
  { href: "/points", key: "pts.tabRequests" as const, icon: Inbox, match: (p: string) => p === "/points" },
  { href: "/points/rewards", key: "pts.tabRewards" as const, icon: Gift, match: (p: string) => p.startsWith("/points/rewards") },
  { href: "/points/customers", key: "pts.tabCustomers" as const, icon: Users, match: (p: string) => p.startsWith("/points/customers") },
];

/**
 * Points & rewards for the game shop: Requests · Rewards · Customers.
 * The same three areas as futsal's Loyalty section in the hub, here inside
 * the shop's own admin app. Customers see their points at /games/account on
 * the hub site.
 */
export function PointsShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const { t } = useT();
  const pathname = usePathname();

  return (
    <AppShell title={t("nav.points")} right={right}>
      <div className="p-4 sm:p-5 px-4 sm:px-[22px] max-w-[1100px] flex flex-col gap-4">
        <nav className="flex gap-1 rounded-md bg-line-faint p-1 self-start max-w-full overflow-x-auto" aria-label={t("nav.points")}>
          {TABS.map(({ href, key, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
                  active ? "bg-surface text-accent shadow-card" : "text-text-secondary hover:text-text",
                )}
              >
                <Icon size={15} />
                {t(key)}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </AppShell>
  );
}
