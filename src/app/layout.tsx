import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Myanmar } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/data/store";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { LocaleProvider } from "@/i18n/LocaleProvider";
import { LOCALE_COOKIE } from "@/i18n/config";
import { getCurrentUser } from "@/lib/data/session";
import type { Locale } from "@/lib/types";

/**
 * Fonts are self-hosted, not pulled from Google at runtime.
 *
 * globals.css used to @import them from fonts.googleapis.com. That failed
 * twice over: the hub's CSP is `style-src 'self'` and `font-src 'self'`, so
 * the browser refused both the stylesheet and the font files - and even
 * without CSP, depending on Google's CDN is the same bet that made this whole
 * project necessary, since the operators that block *.supabase.co are not a
 * safe thing to route a shop's fonts through either.
 *
 * next/font downloads these at BUILD time and serves them from our own origin,
 * so they are same-origin (CSP-clean) and never cross the customer's ISP.
 * Noto Sans Myanmar matters most here: it is what renders Burmese, and it is
 * the one nobody would notice was missing until a staff member did.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const myanmar = Noto_Sans_Myanmar({
  subsets: ["myanmar"],
  weight: ["400", "500", "600"],
  variable: "--font-mm",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MyaThida — Game Shop Management",
  description: "Admin/staff console for a PS4/PS5 walk-in game shop.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved on the server so the shell renders the real person from the very
  // first byte, with no client-side identity to tamper with.
  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()]);
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = stored === "my" ? "my" : "en";

  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable} ${myanmar.variable}`}>
      <body>
        <LocaleProvider initial={locale}>
          <SessionProvider user={user}>
            {/*
              StoreProvider now carries ONLY the demo data for the four screens
              that are not converted yet - no identity, no language. It goes
              when the last of them is done.
            */}
            <StoreProvider>{children}</StoreProvider>
          </SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
