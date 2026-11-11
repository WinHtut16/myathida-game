"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft, Gift, Pencil, Zap } from "lucide-react";
import { adjustPointsAction } from "@/app/actions/points";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Field } from "@/components/ui/Field";
import { useT } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import type { LoyaltyCustomer, LoyaltyTxn } from "@/lib/types";
import { cx, fill } from "@/lib/ui";

/**
 * One customer at the game shop: balance, totals, a correction form and
 * their game points history. Corrections need a reason and cannot take the
 * balance below 0 (checked in the database), and are audited.
 */
export function CustomerDetail({ customer }: { customer: LoyaltyCustomer }) {
  const { t } = useT();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const delta = Number(amount);
  const valid = amount.trim() !== "" && Number.isInteger(delta) && delta !== 0 && reason.trim() !== "";

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await adjustPointsAction(customer.id, delta, reason);
      if (!res.ok) {
        setError(res.message ?? null);
        return;
      }
      setError(null);
      setAmount("");
      setReason("");
      toast.success(fill(t("pts.adjusted"), { n: res.balance ?? 0 }));
    });
  };

  return (
    <>
      <Link href="/points/customers" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text self-start">
        <ArrowLeft size={15} />
        {t("pts.backToCustomers")}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-line rounded-md p-5">
            <div className="text-md font-bold">{customer.username}</div>
            <div className="text-sm text-text-muted tabular-nums">{customer.phone}</div>
            <div className="text-2xs text-text-muted mt-1">
              {fill(t("pts.memberSince"), {
                date: new Date(customer.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Asia/Yangon",
                }),
              })}
            </div>
            <div className="mt-4 text-2xs uppercase tracking-caps text-text-muted font-semibold">{t("pts.balance")}</div>
            <div className={cx("font-display text-4xl font-semibold tabular-nums", customer.balance < 0 && "text-status-expired-ink")}>
              {customer.balance.toLocaleString()}
              <span className="text-sm text-text-muted font-normal ml-1">{t("pts.unit")}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3 mt-4 border-t border-line pt-3 text-sm">
              <div>
                <dt className="text-2xs text-text-muted">{t("pts.col.earned")}</dt>
                <dd className="font-semibold tabular-nums">{customer.earned.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-2xs text-text-muted">{t("pts.redeemed")}</dt>
                <dd className="font-semibold tabular-nums">{customer.redeemed.toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          <form onSubmit={save} className="bg-surface border border-line rounded-md p-5 flex flex-col gap-3">
            <div className="text-sm font-semibold">{t("pts.adjustTitle")}</div>
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
            <Field
              id="adj-amount"
              label={t("pts.adjustAmount")}
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Field
              id="adj-reason"
              label={t("pts.adjustReason")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
            <Button type="submit" loading={pending} disabled={!valid || pending}>
              {t("pts.adjustSave")}
            </Button>
          </form>
        </div>

        <section className="bg-surface border border-line rounded-md overflow-hidden">
          <h2 className="text-sm font-semibold m-0 px-5 py-3 border-b border-line-faint">{t("pts.historyHeading")}</h2>
          {customer.transactions.length === 0 ? (
            <div className="px-5 py-10 text-center text-text-muted text-sm">{t("pts.noTxns")}</div>
          ) : (
            customer.transactions.map((tx) => <TxnRow key={tx.id} tx={tx} />)
          )}
        </section>
      </div>
    </>
  );
}

function TxnRow({ tx }: { tx: LoyaltyTxn }) {
  const { t } = useT();
  const Icon = tx.type === "earn" ? Zap : tx.type === "redeem" ? Gift : Pencil;
  const label =
    tx.type === "earn"
      ? t("pts.txn.earn")
      : tx.type === "redeem"
        ? fill(t("pts.txn.redeem"), { reward: tx.rewardName ?? "" })
        : tx.fromSession
          ? t("pts.txn.sessionFix")
          : t("pts.txn.adjustment");

  return (
    <div className="flex items-start gap-3 px-5 py-3 border-b border-line-hair last:border-0">
      <span
        className={cx(
          "w-8 h-8 rounded-md flex items-center justify-center flex-none",
          tx.type === "earn" ? "bg-status-active-bg text-status-active-ink" : tx.type === "redeem" ? "bg-accent-soft text-accent" : "bg-line-faint text-text-secondary",
        )}
      >
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {tx.note && <div className="text-xs text-text-muted italic truncate">{tx.note}</div>}
        <div className="text-2xs text-text-muted tabular-nums">{formatDateTime(tx.createdAt)}</div>
      </div>
      <span className={cx("text-sm font-semibold tabular-nums flex-none", tx.pointsDelta > 0 ? "text-status-active-ink" : "text-status-expired-ink")}>
        {tx.pointsDelta > 0 ? "+" : ""}
        {tx.pointsDelta.toLocaleString()}
      </span>
    </div>
  );
}
