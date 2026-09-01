import "server-only";

import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "./config";
import { en } from "./en";
import { my } from "./my";
import type { Locale } from "@/lib/types";
import type { MessageKey } from "./index";

/**
 * The server-side counterpart to useT().
 *
 * Server components cannot use the hook, and a screen that renders on the
 * server would otherwise be stuck in English - which for a shop whose staff
 * read Burmese is not a small thing. Both read the same cookie and the same
 * dictionaries, so the two halves of a page always agree on language.
 */
export async function getT(): Promise<{ t: (k: MessageKey) => string; locale: Locale }> {
  const store = await cookies();
  const locale: Locale = store.get(LOCALE_COOKIE)?.value === "my" ? "my" : "en";
  const dict: Record<string, string> = locale === "my" ? my : en;
  return { t: (key: MessageKey) => dict[key] ?? en[key] ?? key, locale };
}
