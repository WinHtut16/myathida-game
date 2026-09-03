/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Next.js multi-zone. This app is a separate repo and a separate Vercel
   * deployment, but it is served to users from the FUTSAL origin
   * (myathida-futsal.vercel.app) under /admin/game, which rewrites to here.
   *
   * Same origin is the entire point. vercel.app is on the Public Suffix List,
   * so two *.vercel.app subdomains can never share a session cookie - the
   * browser refuses outright. Proxying instead of linking out means the
   * browser only ever sees the futsal host, so one login covers all three
   * businesses with no custom domain and no SSO handshake.
   *
   * basePath makes both the pages AND the _next assets live under the prefix,
   * so a single rewrite rule on the hub covers everything.
   *
   * Consequence: this deployment's own URL (myathida-game.vercel.app) serves
   * nothing at its root. That is expected, not a broken deploy - reach it at
   * myathida-game.vercel.app/admin/game/floor if you need to test it directly.
   */
  basePath: "/admin/game",

  /**
   * Without this, Next here answers a bare /admin/game with a 308 to normalise
   * the trailing slash. That 308 travels back through the hub's rewrite
   * pointing at a path the hub rewrites here again, and the browser bounces
   * between the two until it gives up with ERR_TOO_MANY_REDIRECTS. That cost
   * a long afternoon on billiards; Vercel's logs showed ~97 requests to the
   * bare path and not one to the page behind it.
   *
   * The hub also redirects the bare /admin/game straight to /admin/game/floor,
   * so the zone root is never reached at all. Belt and braces, deliberately -
   * this failure is expensive to diagnose and cheap to prevent.
   */
  skipTrailingSlashRedirect: true,

  experimental: {
    /**
     * Server Actions compare the Origin header against Host. Behind the hub's
     * rewrite those disagree - the browser sends the futsal origin, while this
     * deployment sees its own host - and every action fails the CSRF check
     * with no useful error. Listing the hub origin is what makes them work.
     *
     * HUB_HOSTS is how the hub moves without a code change. Myanmar operators
     * block *.vercel.app wholesale - vercel.com loads, an unrelated
     * *.vercel.app does not - so the portal has to live on a domain we own,
     * and this list has to follow it. Set HUB_HOSTS on this Vercel project to
     * a comma-separated list, e.g. "myathida.com,www.myathida.com". The
     * vercel.app host stays below: it is still how this is reached from
     * outside Myanmar and during the switchover.
     *
     * Read at BUILD time, so a change here needs a redeploy of THIS zone, not
     * just the hub. Forget that and every screen loads while every Save fails.
     */
    serverActions: {
      allowedOrigins: [
        "myathida-futsal.vercel.app",
        ...(process.env.HUB_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean) ?? []),
        ...(process.env.ZONE_SELF_HOST ? [process.env.ZONE_SELF_HOST] : []),
      ],
    },
  },
};

export default nextConfig;
