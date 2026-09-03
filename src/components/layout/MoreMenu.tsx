"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tag, Database, User, ScrollText, Grid2x2, LogOut } from "lucide-react";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { LanguageSwitch } from "./LanguageSwitch";

const SUPER_ITEMS = [
  { href: "/pricing", key: "nav.pricing" as const, icon: Tag, match: (p: string) => p.startsWith("/pricing") },
  { href: "/export", key: "nav.export" as const, icon: Database, match: (p: string) => p.startsWith("/export") },
];

/** Sheet content for the mobile "More" tab — the sidebar's superadmin-only
 * items, account, audit log, business switcher, language and sign-out, all
 * in one place. Desktop sees these in the sidebar instead (Sidebar.tsx /
 * SidebarFooter.tsx). See DESIGN.md. */
export function MoreMenu({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const { t } = useT();
  const user = useCurrentUser();
  const superadmin = user?.isSuperadmin ?? false;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/admin/login";
  }

  return (
    <div className="pb-2">
      {superadmin &&
        SUPER_ITEMS.map(({ href, key, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              prefetch={false}
              className={cx(
                "flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px]",
                active ? "bg-line-faint text-ink font-semibold" : "text-text hover:bg-line-faint"
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.9} />
              {t(key)}
            </Link>
          );
        })}

      <Link
        href="/account"
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] text-text hover:bg-line-faint"
      >
        <User size={18} strokeWidth={1.9} />
        {t("account.title")}
      </Link>

      {/* Both plain <a>, not next/link — this app sets basePath /admin/game,
          so Link would double the prefix onto these hub-owned destinations. */}
      {superadmin && (
        <a
          href="/admin/audit?app=game"
          className="flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] text-text hover:bg-line-faint"
        >
          <ScrollText size={18} strokeWidth={1.9} />
          {t("nav.auditLog")}
        </a>
      )}
      <a
        href="/admin/apps"
        className="flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[14px] text-text hover:bg-line-faint"
      >
        <Grid2x2 size={18} strokeWidth={1.9} />
        {t("nav.allBusinesses")}
      </a>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-line px-1 pt-3">
        <LanguageSwitch variant="light" />
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[13px] font-semibold text-text-secondary hover:bg-line-faint"
        >
          <LogOut size={16} />
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );
}
