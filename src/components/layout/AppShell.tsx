"use client";

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

/**
 * App chrome: dark rail + top bar + scrollable content. Every authed screen
 * renders inside this. `right` holds page-specific actions (search, buttons).
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
        <header className="h-16 bg-surface border-b border-line-soft flex items-center justify-between px-[22px] flex-none">
          <div className="flex items-baseline gap-3.5">
            <h1 className="text-[19px] font-bold m-0">{title}</h1>
            {subtitle && <span className="text-[13px] text-text-muted font-mono">{subtitle}</span>}
          </div>
          {right}
        </header>
        <main className={`flex-1 overflow-auto ${contentClassName}`}>{children}</main>
      </div>
    </div>
  );
}
