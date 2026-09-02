"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Grid2x2, User, ScrollText } from "lucide-react";
import { useCurrentUser } from "@/components/providers/SessionProvider";
import { LanguageSwitch } from "./LanguageSwitch";
import { useT } from "@/i18n";

/**
 * The bottom of the rail: who you are, a way out of this business, and sign out.
 *
 * Until now the game shop had NO exit. Once a zone had swallowed you the only
 * way back to the portal or out of the session was editing the address bar,
 * which for shop staff means "the app is stuck".
 *
 * Both links here are plain <a>, not next/link, and that is load-bearing: this
 * app sets basePath /admin/game, so Link would rewrite /admin/apps into
 * /admin/game/admin/apps - the doubled-path shape that 404'd on billiards.
 * These two destinations live on the hub, outside this app entirely.
 */
export function SidebarFooter() {
  const { t } = useT();
  const user = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    /**
     * The hub's route, reached on the same origin through the zone rewrite.
     * Sign-out is done server-side there for a reason worth preserving:
     * supabase-js's client-side signOut() calls Supabase over the network and
     * only clears the session cookies after that call succeeds - so on a
     * network that blocks *.supabase.co it fails, the cookies survive, and the
     * user is told they are logged out while still being logged in.
     */
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Full navigation, not the router: /admin/login is outside this basePath.
    window.location.href = "/admin/login";
  }

  return (
    <div className="mt-auto px-3 flex flex-col gap-2.5">
      {/* Superadmins only, pre-filtered to the shop. The audit_log select
          policy already scopes a game-only superadmin to game rows, so an
          unfiltered link would just look like the filter was broken. */}
      {user?.isSuperadmin && (
        <a
          href="/admin/audit?app=game"
          className="flex items-center gap-2.5 px-3 py-2 rounded-[7px] text-[13px] text-[#9aa0aa] hover:bg-[#2c3037] hover:text-[#c7cbd3]"
        >
          <ScrollText size={15} />
          {t("nav.auditLog")}
        </a>
      )}

      <a
        href="/admin/apps"
        className="flex items-center gap-2.5 px-3 py-2 rounded-[7px] text-[13px] text-[#9aa0aa] hover:bg-[#2c3037] hover:text-[#c7cbd3]"
      >
        <Grid2x2 size={15} />
        {t("nav.allBusinesses")}
      </a>

      <LanguageSwitch variant="dark" />

      <div className="flex items-center gap-2 border-t border-[#34383f] pt-2.5">
        <Link
          href="/account"
          className="flex items-center gap-2.5 flex-1 min-w-0 px-1 py-1.5 rounded-md hover:bg-[#2c3037]"
        >
          <span className="w-[30px] h-[30px] rounded-full bg-[#3b3f47] flex items-center justify-center text-[#c7cbd3] flex-none">
            <User size={15} />
          </span>
          <span className="leading-[1.15] min-w-0">
            <span className="block text-white text-[13px] font-medium truncate">
              {user?.name ?? t("common.signedOut")}
            </span>
            <span className="block text-[10.5px] text-[#7d838e]">
              {user ? t(user.isSuperadmin ? "role.superadmin" : "role.admin") : "—"}
            </span>
          </span>
        </Link>

        <button
          onClick={signOut}
          disabled={signingOut}
          title={t("nav.signOut")}
          aria-label={t("nav.signOut")}
          className="flex-none w-8 h-8 rounded-md flex items-center justify-center text-[#9aa0aa] hover:bg-[#3a2a2a] hover:text-[#e88c7d] disabled:opacity-45"
        >
          <LogOut size={15} />
        </button>
      </div>
    </div>
  );
}
