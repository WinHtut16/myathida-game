"use client";

import { useState, useTransition } from "react";
import { Star, UserRound, X } from "lucide-react";
import { setSessionCustomerAction } from "@/app/actions/live-session";
import { useT } from "@/i18n";
import { maskPhone } from "@/lib/points";
import type { PointRule, SessionCustomer } from "@/lib/types";
import { fill } from "@/lib/ui";

/**
 * Who earns points for this session: a REGISTERED customer, found by exact
 * phone. One shared account covers futsal, the game shop and billiards, but
 * each business keeps its own points.
 *
 * No local copy of the customer: the action revalidates this page, so the
 * prop is always what the database holds - including a change made from the
 * other phone at the counter.
 */
export function CustomerField({
  sessionId,
  customer,
  pointRule,
}: {
  sessionId: string;
  customer: SessionCustomer | null | undefined;
  pointRule: PointRule | null;
}) {
  const { t } = useT();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (value: string | null) =>
    start(async () => {
      const result = await setSessionCustomerAction(sessionId, value);
      if (!result.ok) {
        setError(result.message ?? null);
        return;
      }
      setError(null);
      setPhone("");
    });

  const on = pointRule?.isActive && pointRule.pointsPerBlock > 0;

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="text-2xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
        {t("points.customer")}
      </div>

      {customer ? (
        <div className="flex items-center justify-between gap-2 border border-line rounded-md px-3 py-2">
          <span className="flex items-center gap-2 min-w-0">
            <UserRound size={15} className="text-accent flex-none" />
            <span className="text-sm font-medium text-text truncate">{customer.name}</span>
            <span className="text-2xs text-text-muted tabular-nums flex-none">{maskPhone(customer.phone)}</span>
          </span>
          <button
            onClick={() => submit(null)}
            disabled={pending}
            aria-label={t("points.remove")}
            className="text-text-muted hover:text-status-expired-ink disabled:opacity-50 flex-none"
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (phone.trim()) submit(phone);
          }}
        >
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("points.phonePlaceholder")}
            className="flex-1 min-w-0 bg-surface border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent tabular-nums"
          />
          <button
            type="submit"
            disabled={pending || phone.trim() === ""}
            className="border border-line-soft bg-surface text-text rounded-md px-4 py-2 text-sm font-semibold hover:bg-line-faint disabled:opacity-50 transition-colors"
          >
            {t("points.add")}
          </button>
        </form>
      )}

      {error ? (
        <p className="text-2xs text-status-expired-ink mt-1.5 m-0">{error}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-2xs text-text-muted mt-1.5 m-0">
          <Star size={12} className="flex-none" />
          {on
            ? fill(t("points.earnHint"), { p: pointRule!.pointsPerBlock, m: pointRule!.blockMinutes })
            : t("points.off")}
        </p>
      )}
    </div>
  );
}
