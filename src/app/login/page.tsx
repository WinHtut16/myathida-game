"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";

/**
 * Static sign-in. Two modes:
 *  - Superadmin → email + password (accounts created by hand in Supabase).
 *  - Admin → phone + password (accounts created in-app by a superadmin).
 * Wire to Supabase Auth on handoff; on success redirect to "/".
 */
export default function LoginPage() {
  const { t } = useT();
  const [mode, setMode] = useState<"super" | "admin">("admin");

  return (
    <div
      className="min-h-screen bg-rail flex items-center justify-center relative px-4"
      style={{ backgroundImage: "radial-gradient(circle at 1px 1px,#31353d 1px,transparent 0)", backgroundSize: "26px 26px" }}
    >
      <div className="absolute top-5 right-6">
        <LanguageSwitch variant="dark" />
      </div>

      <div className="w-[400px] max-w-full bg-surface rounded-[14px] shadow-modal p-9 px-[34px]">
        <div className="flex flex-col items-center gap-3.5 mb-6">
          <span className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white font-mono font-bold text-2xl">M</span>
          <div className="text-center">
            <div className="text-[19px] font-bold">{t("login.title")}</div>
            <div className="text-[12.5px] text-text-muted">{t("login.subtitle")}</div>
          </div>
        </div>

        <div className="flex bg-line-faint border border-line-soft rounded-lg p-1 mb-5 text-[13px] font-semibold">
          {(["admin", "super"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx("flex-1 text-center py-2 rounded-md", mode === m ? "bg-ink text-white" : "text-text-secondary")}
            >
              {t(m === "admin" ? "login.adminTab" : "login.superTab")}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <div className="text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
              {mode === "super" ? t("login.email") : t("login.phone")}
            </div>
            <input
              type={mode === "super" ? "email" : "tel"}
              defaultValue={mode === "super" ? "owner@myathida.app" : "+959770000001"}
              className="w-full border border-line rounded-lg px-3 py-2.5 text-sm font-mono outline-none"
            />
          </div>
          <div>
            <div className="text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">{t("login.password")}</div>
            <input type="password" defaultValue="password" className="w-full border border-line rounded-lg px-3 py-2.5 text-sm tracking-[3px] outline-none" />
          </div>
          <Link href="/floor" className="mt-1.5 bg-ink text-white rounded-lg py-3 text-sm font-semibold text-center">
            {t("login.signIn")}
          </Link>
        </div>
      </div>
    </div>
  );
}
