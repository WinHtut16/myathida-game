"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Ban, Plus, Receipt, Trash2 } from "lucide-react";
import {
  addSessionItemAction,
  cancelSessionAction,
  closeSessionAction,
  removeSessionItemAction,
} from "@/app/actions/live-session";
import { AppShell } from "@/components/layout/AppShell";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { localizedName, useT } from "@/i18n";
import { formatMMK } from "@/lib/format";
import { useAutoRefresh } from "@/lib/hooks/useAutoRefresh";
import { useNow } from "@/lib/hooks/useNow";
import { formatElapsed, previewLiveTotal } from "@/lib/pricing";
import type { ActiveSession, PaymentMethod, Pricing, Product } from "@/lib/types";
import { cx, fill } from "@/lib/ui";

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "kbzpay", "wave", "other"];

export function LiveSessionView({
  session,
  pricing,
  products,
}: {
  session: ActiveSession;
  pricing: Pricing;
  products: Product[];
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<"none" | "close" | "cancel">("none");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [waive, setWaive] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  // Someone else may add a snack from the other phone. Same stand-in for
  // Realtime the floor board uses.
  useAutoRefresh();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok && result.message) setError(result.message);
    });

  const addItem = (productId: string) =>
    run(() => addSessionItemAction(session.id, productId, 1));

  const removeLine = (lineId: string) =>
    run(() => removeSessionItemAction(lineId, session.id));

  const close = () =>
    startTransition(async () => {
      const result = await closeSessionAction(session.id, method, waive ? 1 : 0);
      if (!result.ok) {
        if (result.message) setError(result.message);
        return;
      }
      // The session no longer exists as "open", so staying here would render
      // the not-open notice. Back to the board, where the TV now reads free.
      router.push("/floor");
    });

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelSessionAction(session.id, reason);
      if (!result.ok) {
        if (result.message) setError(result.message);
        return;
      }
      router.push("/floor");
    });

  return (
    <AppShell
      title={`${session.stationName} · ${t("session.title")}`}
      subtitle={session.label ?? undefined}
      contentClassName="flex flex-col"
      right={
        <Link
          href="/floor"
          className="flex items-center gap-2 border border-line-soft bg-surface text-text rounded-md px-3 py-2 text-sm font-semibold hover:bg-line-faint transition-colors"
        >
          <ArrowLeft size={15} />
          <span className="hidden sm:inline">{t("session.backToFloor")}</span>
        </Link>
      }
    >
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mx-4 sm:mx-5 mt-4" />
      )}

      <div className="flex-1 overflow-auto p-4 sm:p-5">
        <div className="max-w-[860px] grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── the clock and the money ── */}
          <section className="bg-surface border border-line rounded-xl shadow-card p-5">
            <LiveBill session={session} pricing={pricing} waive={waive} />

            {pane === "none" && (
              <div className="mt-5 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => setPane("close")}
                  disabled={isPending}
                  className="flex-1 flex items-center justify-center gap-2 bg-accent text-white rounded-md py-3 text-sm font-semibold hover:bg-accent-strong disabled:opacity-60 transition-colors"
                >
                  <Receipt size={16} />
                  {t("session.close")}
                </button>
                <button
                  onClick={() => setPane("cancel")}
                  disabled={isPending}
                  className="flex items-center justify-center gap-2 border border-line-soft bg-surface text-text-secondary rounded-md px-4 py-3 text-sm font-semibold hover:bg-line-faint disabled:opacity-60 transition-colors"
                >
                  <Ban size={15} />
                  {t("session.cancel")}
                </button>
              </div>
            )}

            {pane === "close" && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="text-sm font-semibold text-text mb-2">{t("session.closeTitle")}</div>
                <div className="text-2xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
                  {t("session.payBy")}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={cx(
                        "rounded-md py-2 text-xs font-semibold border transition-colors",
                        method === m
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line bg-surface text-text-secondary hover:bg-line-faint",
                      )}
                    >
                      {t(`session.pay.${m}` as never)}
                    </button>
                  ))}
                </div>

                <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={waive}
                    onChange={(e) => setWaive(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium text-text">{t("session.waive")}</span>
                    <span className="block text-2xs text-text-muted">
                      {fill(t("session.waiveHint"), { m: pricing.incrementMinutes })}
                    </span>
                  </span>
                </label>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={close}
                    disabled={isPending}
                    className="flex-1 bg-accent text-white rounded-md py-2.5 text-sm font-semibold hover:bg-accent-strong disabled:opacity-60 transition-colors"
                  >
                    <LiveTotalLabel session={session} pricing={pricing} waive={waive} />
                  </button>
                  <button
                    onClick={() => setPane("none")}
                    disabled={isPending}
                    className="border border-line-soft bg-surface text-text-secondary rounded-md px-4 py-2.5 text-sm font-semibold hover:bg-line-faint disabled:opacity-60"
                  >
                    {t("session.keepIt")}
                  </button>
                </div>
              </div>
            )}

            {pane === "cancel" && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="text-sm font-semibold text-text mb-1">{t("session.cancelTitle")}</div>
                <p className="text-2xs text-text-muted leading-relaxed mb-3">
                  {t("session.cancelHint")}
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("session.cancelReason")}
                  className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={cancel}
                    disabled={isPending || reason.trim() === ""}
                    className="flex-1 bg-status-expired-ink text-white rounded-md py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {t("session.confirmCancel")}
                  </button>
                  <button
                    onClick={() => setPane("none")}
                    disabled={isPending}
                    className="border border-line-soft bg-surface text-text-secondary rounded-md px-4 py-2.5 text-sm font-semibold hover:bg-line-faint disabled:opacity-60"
                  >
                    {t("session.keepIt")}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── snacks ── */}
          <section className="bg-surface border border-line rounded-xl shadow-card p-5">
            <div className="text-sm font-semibold text-text mb-3">{t("session.snacks")}</div>

            {session.orders.length === 0 ? (
              <p className="text-xs text-text-muted m-0 mb-4">{t("session.noSnacks")}</p>
            ) : (
              <ul className="list-none p-0 m-0 mb-4 space-y-1.5">
                {session.orders.map((line) => (
                  <li
                    key={line.id ?? `${line.productId}-${line.qty}`}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-text">
                      {line.qty}× {line.productName}
                    </span>
                    <span className="flex items-center gap-2 flex-none">
                      <span className="tabular-nums text-text-secondary">
                        {formatMMK(line.lineTotal)}
                      </span>
                      {line.id && (
                        <button
                          onClick={() => removeLine(line.id as string)}
                          disabled={isPending}
                          aria-label={t("session.remove")}
                          className="text-text-muted hover:text-status-expired-ink disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="text-2xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
              {t("session.addSnack")}
            </div>
            <div className="space-y-1.5 max-h-[340px] overflow-auto">
              {products.map((p) => {
                // Stock moved when the snack was added, so this is the real
                // shelf count, not an optimistic guess.
                const out = p.stock !== null && p.stock <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addItem(p.id)}
                    disabled={isPending || out}
                    className={cx(
                      "w-full flex items-center justify-between gap-2 border rounded-md px-3 py-2 text-sm transition-colors",
                      out
                        ? "border-line bg-line-faint text-text-muted cursor-not-allowed"
                        : "border-line bg-surface text-text hover:border-accent hover:bg-accent-soft",
                    )}
                  >
                    <span className="min-w-0 truncate">{localizedName(locale, p)}</span>
                    <span className="flex items-center gap-2 flex-none">
                      <span className="tabular-nums text-text-secondary">{formatMMK(p.price)}</span>
                      {out ? (
                        <span className="text-2xs">{t("session.outOfStock")}</span>
                      ) : (
                        <Plus size={14} className="text-accent" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-text-muted" : "text-text-secondary"}>{label}</dt>
      <dd className={cx("tabular-nums", muted ? "text-text-muted" : "text-text")}>{value}</dd>
    </div>
  );
}

/**
 * The clock and the money, ticking once a second from useNow(). Split out of
 * LiveSessionView so the tick re-renders only this section - the snack picker
 * over every product, and the close/cancel panes, used to re-render along
 * with it every second because useNow() sat at the top of the whole screen.
 */
function LiveBill({
  session,
  pricing,
  waive,
}: {
  session: ActiveSession;
  pricing: Pricing;
  waive: boolean;
}) {
  const { t } = useT();
  const now = useNow();

  /**
   * The running bill, recomputed every tick from the server's startedAt.
   *
   * This is the same rule game.close_session() charges by - pinned to it by
   * pricing.test.ts and db-tests/97-game-live-sessions.sql, which assert the
   * identical table of boundaries. The server is still the authority; this
   * exists so the staff member sees the number they are about to charge rather
   * than an approximation of it.
   */
  const bill = previewLiveTotal(session.startedAt, pricing, session.orders, now, waive ? 1 : 0);

  return (
    <>
      <div className="text-2xs font-semibold uppercase tracking-wide text-text-muted">
        {t("session.elapsed")}
      </div>
      <div className="font-display text-5xl font-semibold tabular-nums tracking-tight text-text leading-none mt-1">
        {formatElapsed(bill.elapsed)}
      </div>
      <div className="text-xs text-text-muted mt-2">
        {t("session.billingFor")} {bill.chargedMinutes} {t("floor.minutesShort")}
        {" · "}
        {formatMMK(pricing.ratePerHour)}/{t("floor.hourUnit")}
      </div>

      <dl className="mt-5 border-t border-line pt-4 space-y-2 text-sm">
        <Row label={t("session.playtime")} value={formatMMK(bill.playtimeTotal)} />
        <Row label={t("session.snacks")} value={formatMMK(bill.snacksTotal)} />
        {bill.waivedMinutes > 0 && (
          <Row
            label={t("session.waive")}
            value={`−${bill.waivedMinutes} ${t("floor.minutesShort")}`}
            muted
          />
        )}
        <div className="flex items-center justify-between border-t border-line pt-3 mt-1">
          <dt className="font-semibold text-text">{t("session.total")}</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums text-text">
            {formatMMK(bill.total)}
          </dd>
        </div>
      </dl>
    </>
  );
}

/**
 * Just the confirm-close button's total, ticking on its own. The close pane
 * needs the live figure too (the bill keeps moving while the pane is open),
 * so this is its own small ticker rather than reading LiveBill's state -
 * they are two separate elements on screen and neither should force the
 * other, or the rest of the page, to re-render every second.
 */
function LiveTotalLabel({
  session,
  pricing,
  waive,
}: {
  session: ActiveSession;
  pricing: Pricing;
  waive: boolean;
}) {
  const { t } = useT();
  const now = useNow();
  const bill = previewLiveTotal(session.startedAt, pricing, session.orders, now, waive ? 1 : 0);
  return (
    <>
      {t("session.confirmClose")} · {formatMMK(bill.total)}
    </>
  );
}
