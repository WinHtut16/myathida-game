"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/types";
import { LOCALE_COOKIE } from "./config";

/**
 * UI language.
 *
 * This used to live in the mock data store, which coupled every translated
 * string in the app to a pile of fake stations and staff - so the store could
 * not be removed until the language toggle had somewhere else to live. It
 * lives here now.
 *
 * The choice is kept in a cookie rather than the database so it survives a
 * reload, applies from the very first server render (no flash of English), and
 * works before the account has a game.staff row. game.staff.preferred_lang
 * exists for making it follow a person between devices later.
 */
export { LOCALE_COOKIE } from "./config";

interface LocaleValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Written from the browser on purpose: switching language is a UI
    // preference, and a server round trip would put a visible delay on a
    // button whose whole job is to feel instant. One year, SameSite=Lax.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within <LocaleProvider>");
  return ctx;
}
