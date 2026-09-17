import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { getLiveSession } from "@/lib/data/live-session";
import { LiveSessionView } from "@/components/session/LiveSessionView";

/**
 * One running session: the timer, its snacks, and the way it gets paid for.
 *
 * A SERVER component, like the floor board, and for the same reason: Myanmar
 * operators block *.supabase.co, so a browser-side read works in development
 * and fails for the staff who actually use this.
 */

// Two staff share this screen and the bill changes with the clock. A cached
// render would show one of them a session that has already been paid for.
export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getLiveSession(id);

  if (!data.ok) {
    return <Notice message={data.message} />;
  }

  return (
    <LiveSessionView
      session={data.session}
      pricing={data.pricing}
      products={data.products}
    />
  );
}

/**
 * Shown when the session cannot be loaded. Most often that is not an error at
 * all but a race: two staff on two phones, and the other one closed it first.
 * Saying so beats a dead timer or a blank screen.
 */
function Notice({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-6">
      <div className="max-w-[460px] w-full bg-surface border border-line rounded-xl shadow-card p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-8 h-8 rounded-lg bg-status-warn-bg text-status-warn-deep flex items-center justify-center flex-none">
            <TriangleAlert size={17} />
          </span>
          <h1 className="text-lg font-bold m-0">This session is not open</h1>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed m-0 mb-4">{message}</p>
        <Link
          href="/floor"
          className="inline-flex items-center gap-2 bg-accent text-white rounded-md px-4 py-2.5 text-sm font-semibold hover:bg-accent-strong transition-colors"
        >
          <ArrowLeft size={15} />
          Back to floor
        </Link>
      </div>
    </div>
  );
}
