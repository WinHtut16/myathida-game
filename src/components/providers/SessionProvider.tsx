"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CurrentUser } from "@/lib/data/session";

/**
 * Carries the real signed-in user down to the client components that render
 * the shell. It is a transport, not a source: the value is resolved on the
 * server in the root layout and cannot be changed from the browser.
 */
const SessionContext = createContext<CurrentUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

/** The signed-in user, or null when the zone is reached without a session. */
export function useCurrentUser(): CurrentUser | null {
  return useContext(SessionContext);
}
