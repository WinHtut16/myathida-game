/**
 * Shared between the server translator and the client provider, so neither
 * has to import the other. LocaleProvider is a "use client" module; pulling
 * it into a server file would drag the whole client boundary along with it.
 */
export const LOCALE_COOKIE = "game_locale";
