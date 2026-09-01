"use client";

import { useState } from "react";
import { ChevronDown, PackagePlus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useStore } from "@/lib/data/store";
import { DemoNotice } from "@/components/DemoNotice";
import { localizedName, useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { formatMMK } from "@/lib/format";
import type { ProductCategory } from "@/lib/types";

export default function ProductsPage() {
  const { t, locale } = useT();
  const { state, dispatch } = useStore();

  const [nameEn, setNameEn] = useState("");
  const [nameMy, setNameMy] = useState("");
  const [category, setCategory] = useState<ProductCategory>("drink");
  const [price, setPrice] = useState(0);

  const save = () => {
    if (!nameEn.trim()) return;
    dispatch({
      type: "UPSERT_PRODUCT",
      product: {
        id: `p_${Math.random().toString(36).slice(2, 8)}`,
        nameEn: nameEn.trim(),
        nameMy: nameMy.trim() || nameEn.trim(),
        category,
        price,
        stock: 0,
        active: true,
      },
    });
    setNameEn("");
    setNameMy("");
    setPrice(0);
  };

  return (
    <AppShell title={t("nav.snacks")}>
      <DemoNotice />
      <div className="p-5 px-[22px] grid grid-cols-[1.6fr_1fr] gap-4 max-w-[1200px]">
        {/* table */}
        <div className="bg-surface border border-line rounded-[10px] overflow-hidden self-start">
          <div className="grid grid-cols-[2fr_1fr_1fr_.8fr_.7fr] gap-3 p-3 px-5 border-b border-line-faint text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold">
            <span>{t("products.name")}</span>
            <span>{t("products.category")}</span>
            <span className="text-right">{t("products.price")}</span>
            <span className="text-right">{t("products.stock")}</span>
            <span className="text-center">{t("products.active")}</span>
          </div>
          {state.products.map((p) => (
            <div
              key={p.id}
              className={cx(
                "grid grid-cols-[2fr_1fr_1fr_.8fr_.7fr] gap-3 p-3.5 px-5 border-b border-line-hair items-center",
                !p.active && "opacity-55",
              )}
            >
              <div>
                <div className="text-sm font-semibold">{localizedName(locale, p)}</div>
                <div className="mm text-xs text-text-muted">{p.nameMy}</div>
              </div>
              <span
                className={cx(
                  "text-[12.5px] px-2.5 py-[3px] rounded-md justify-self-start",
                  p.category === "drink" ? "bg-[#eef3fa] border border-[#dbe6f5] text-accent2" : "bg-line-faint text-text-secondary",
                )}
              >
                {t(p.category === "drink" ? "cat.drink" : "cat.snack")}
              </span>
              <span className="font-mono text-[13.5px] text-right">{formatMMK(p.price)}</span>
              <span
                className={cx(
                  "font-mono text-[13.5px] text-right",
                  p.stock !== null && p.stock <= 3 ? "text-status-expired-ink" : "text-text-secondary",
                )}
              >
                {p.stock === null ? "—" : p.stock}
              </span>
              <button
                onClick={() => dispatch({ type: "TOGGLE_PRODUCT", id: p.id })}
                className={cx(
                  "justify-self-center w-[34px] h-5 rounded-full relative transition-colors",
                  p.active ? "bg-success" : "bg-line",
                )}
              >
                <span
                  className={cx(
                    "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
                    p.active ? "right-0.5" : "left-0.5",
                  )}
                />
              </button>
            </div>
          ))}
        </div>

        {/* form */}
        <div className="bg-surface border border-line rounded-[10px] p-[22px] flex flex-col gap-4 self-start">
          <div className="text-[15px] font-bold flex items-center gap-2">
            <PackagePlus size={18} />
            {t("products.new")}
          </div>
          <Field label={t("products.nameEn")}>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Sprite" className="input" />
          </Field>
          <Field label={t("products.nameMy")}>
            <input value={nameMy} onChange={(e) => setNameMy(e.target.value)} placeholder="စပရိုက်" className="input mm" />
          </Field>
          <div className="flex gap-3">
            <Field label={t("products.category")} className="flex-1">
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ProductCategory)}
                  className="input appearance-none pr-8"
                >
                  <option value="drink">{t("cat.drink")}</option>
                  <option value="snack">{t("cat.snack")}</option>
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </Field>
            <Field label={t("products.price")} className="flex-1">
              <input
                type="number"
                min={0}
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
                placeholder="1,000"
                className="input font-mono"
              />
            </Field>
          </div>
          <button onClick={save} className="bg-ink text-white rounded-lg py-3 text-sm font-semibold">
            {t("products.save")}
          </button>
        </div>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #dcdfe5;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          outline: none;
          background: #fff;
        }
      `}</style>
    </AppShell>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">{label}</div>
      {children}
    </div>
  );
}
