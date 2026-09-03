/**
 * Shared between the server translator and the client provider, so neither
 * has to import the other. LocaleProvider is a "use client" module; pulling
 * it into a server file would drag the whole client boundary along with it.
 *
 * Also shared across all three admin apps (hub, Billiards_MyaThida, this) —
 * same cookie name, same origin via the zone rewrite, so switching language
 * in one is meant to switch it everywhere. See DESIGN.md. Was "game_locale"
 * until this got unified.
 */
export const LOCALE_COOKIE = "lang";
