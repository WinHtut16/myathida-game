"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

/**
 * App chrome: dark rail (desktop) / bottom nav (mobile) + top bar +
 * scrollable content. Every authed screen renders inside this. `right`
 * holds page-specific actions (search, buttons).
 */
export function AppShell({
  title,
  subtitle,
  right,
  children,
  contentClassName = "",
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <div className="flex h-screen bg-app-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {/* h-[var(--topbar-h)]: same 56px as the hub and the POS. See DESIGN.md. */}
        <header className="h-[var(--topbar-h)] bg-surface border-b border-line-soft flex items-center justify-between px-[22px] flex-none">
          <div className="flex items-baseline gap-3.5 min-w-0">
            <h1 className="text-[17px] md:text-[19px] font-bold m-0 truncate">{title}</h1>
            {subtitle && <span className="hidden sm:inline text-[13px] text-text-muted font-mono">{subtitle}</span>}
          </div>
          {right}
        </header>
        <main className={`flex-1 overflow-auto pb-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom))] md:pb-0 ${contentClassName}`}>
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
