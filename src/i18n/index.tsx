"use client";

import { useStore } from "@/lib/data/store";
import type { Locale } from "@/lib/types";
import { en } from "./en";
import { my } from "./my";

export type MessageKey = keyof typeof en;

const dictionaries: Record<Locale, Record<string, string>> = { en, my };

/**
 * Tiny i18n hook. UI strings live here; bilingual DATA (product names) lives on
 * the records themselves (nameEn / nameMy) — see localizedName below.
 */
export function useT() {
  const { state } = useStore();
  const dict = dictionaries[state.locale] ?? en;
  const t = (key: MessageKey): string => dict[key] ?? en[key] ?? key;
  return { t, locale: state.locale };
}

/** Pick the right localized field from a record that carries both languages. */
export function localizedName(
  locale: Locale,
  record: { nameEn: string; nameMy: string },
): string {
  return locale === "my" ? record.nameMy : record.nameEn;
}
