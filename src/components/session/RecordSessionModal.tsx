"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { recordSessionAction } from "@/app/actions/floor";
import { localizedName, useT } from "@/i18n";
import { cx, fill } from "@/lib/ui";
import { formatMMK, formatMMKUnit } from "@/lib/format";
import { previewTotal, rateFor } from "@/lib/pricing";
import type { OrderLine, Pricing, Product, StationView } from "@/lib/types";

const PRESETS = [30, 60, 90, 120];

export function RecordSessionModal({
  stationId,
  stations,
  pricing: pricingList,
  products,
  onError,
  onClose,
}: {
  stationId: string | null;
  stations: StationView[];
  pricing: Pricing[];
  products: Product[];
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useT();
  const [saving, startSaving] = useTransition();

  const available = stations
    .map((v) => v.station)
    .filter((s) => s.status !== "maintenance")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const [sid, setSid] = useState<string>(stationId ?? available[0]?.id ?? "");
  const [minutes, setMinutes] = useState<number>(60);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [label, setLabel] = useState("");

  const station = available.find((s) => s.id === sid);
  const pricing = station ? rateFor(pricingList, station.tier) : null;

  const orderLines: OrderLine[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const p = products.find((x) => x.id === id)!;
          return { productId: id, productName: p.nameEn, qty, unitPrice: p.price, lineTotal: p.price * qty };
        })
        .filter((l) => l.qty > 0),
    [cart, products],
  );

  const preview = pricing ? previewTotal(minutes, pricing, orderLines) : null;

  const setQty = (id: string, delta: number) =>
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  /**
   * The figures on screen are a PREVIEW and nothing more. Only the station, the
   * minutes, the product ids and their quantities are sent; game.record_session
   * re-derives every price from the database. If the two ever disagree - a
   * price changed while this modal sat open - the database wins, which is the
   * correct answer for money.
   *
   * The modal stays open until the write is confirmed. Closing optimistically
   * would tell staff a sale was recorded when it may have been refused for
   * being out of stock, and on a POS that discrepancy is found at cash-up.
   */
  const save = () => {
    if (!station || minutes <= 0 || saving) return;
    startSaving(async () => {
      const result = await recordSessionAction({
        stationId: station.id,
        minutes,
        items: orderLines.map((l) => ({ productId: l.productId, qty: l.qty })),
        label: label.trim() || null,
      });
      if (result.ok) {
        onClose();
      } else if (result.message) {
        onError(result.message);
        onClose();
      }
    });
  };

  const activeProducts = products.filter((p) => p.active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="w-[620px] max-w-full max-h-[86vh] bg-surface rounded-xl shadow-modal overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-[18px] px-[22px] border-b border-line-faint">
          <div>
            <div className="text-[17px] font-bold">{t("record.title")}</div>
            <div className="text-[12.5px] text-text-muted">{t("record.subtitle")}</div>
          </div>
          <button onClick={onClose} className="text-text-muted">
            <X size={18} />
          </button>
        </div>

        <div className="p-[22px] flex flex-col gap-[18px] overflow-auto">
          {/* station + rate */}
          <div className="flex gap-3.5">
            <div className="flex-1">
              <Label>{t("record.station")}</Label>
              <select
                value={sid}
                onChange={(e) => setSid(e.target.value)}
                className="w-full border border-line rounded-lg px-3 py-2.5 text-sm outline-none bg-white"
              >
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.tier}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <Label>{t("record.rate")}</Label>
              <div className="border border-line-faint bg-[#fafbfc] rounded-lg px-3 py-2.5 text-sm font-mono">
                {pricing ? `${formatMMK(pricing.ratePerHour)} / hr` : "—"}
              </div>
            </div>
          </div>

          {/* duration */}
          <div>
            <Label>{t("record.duration")}</Label>
            <div className="grid grid-cols-5 gap-2">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  className={cx(
                    "rounded-lg py-2.5 text-sm font-semibold border",
                    minutes === m ? "border-2 border-accent bg-[#eef3fa]" : "border-line",
                  )}
                >
                  {m}
                  <span className="text-[11px] text-text-muted"> {t("record.minutes")}</span>
                </button>
              ))}
              <input
                type="number"
                min={1}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 0))}
                className="rounded-lg py-2.5 text-sm font-semibold border border-line text-center font-mono outline-none"
                aria-label={t("record.customMinutes")}
              />
            </div>
            {pricing && <div className="text-[11.5px] text-text-muted mt-1.5">{fill(t("record.minCharge"), { m: pricing.minMinutes })}</div>}
          </div>

          {/* snacks */}
          <div>
            <Label>{t("record.snacks")}</Label>
            <div className="grid grid-cols-2 gap-2 max-h-[180px] overflow-auto pr-1">
              {activeProducts.map((p) => {
                const qty = cart[p.id] ?? 0;
                return (
                  <div key={p.id} className={cx("flex items-center justify-between border rounded-lg px-3 py-2", qty > 0 ? "border-ink" : "border-line")}>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate">{localizedName(locale, p)}</div>
                      <div className="text-[11px] text-text-muted font-mono">{formatMMK(p.price)}</div>
                    </div>
                    {qty > 0 ? (
                      <div className="flex items-center gap-1.5 bg-ink rounded-md p-0.5 flex-none">
                        <button className="w-5 h-5 flex items-center justify-center text-white" onClick={() => setQty(p.id, -1)}>
                          <Minus size={12} />
                        </button>
                        <span className="text-white font-mono text-[13px] min-w-3 text-center">{qty}</span>
                        <button className="w-5 h-5 flex items-center justify-center text-white" onClick={() => setQty(p.id, 1)}>
                          <Plus size={12} />
                        </button>
                      </div>
                    ) : (
                      <button className="w-6 h-6 rounded-md bg-line-faint border border-line-soft flex items-center justify-center flex-none" onClick={() => setQty(p.id, 1)}>
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* label */}
          <div>
            <Label>
              {t("record.label")} <span className="normal-case tracking-normal font-normal">{t("record.optional")}</span>
            </Label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ko Aung"
              className="w-full border border-line rounded-lg px-3 py-2.5 text-sm outline-none"
            />
          </div>
        </div>

        {/* footer total */}
        <div className="border-t border-line-faint bg-[#fafbfc] p-4 px-[22px] flex items-center justify-between">
          {preview && (
            <div className="text-[12.5px] text-text-secondary">
              {t("record.playtime")} <span className="font-mono">{formatMMK(preview.playtimeTotal)}</span>
              {preview.snacksTotal > 0 && (
                <>
                  {" · "}
                  {t("record.snacksTotal")} <span className="font-mono">{formatMMK(preview.snacksTotal)}</span>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10.5px] text-text-muted uppercase tracking-[.1em]">{t("record.total")}</div>
              <div className="font-mono text-[20px] font-bold">{preview ? formatMMKUnit(preview.total) : "—"}</div>
            </div>
            <button
              onClick={save}
              disabled={!station || minutes <= 0 || saving}
              className="bg-success text-white rounded-lg px-5 py-3 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check size={16} />
              {saving ? t("record.saving") : t("record.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] tracking-[.12em] uppercase text-text-muted font-semibold mb-2">{children}</div>;
}
