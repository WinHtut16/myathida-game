"use client";

import { useState, useTransition } from "react";
import { ChevronDown, PackagePlus, TriangleAlert, Check, X } from "lucide-react";
import {
  upsertProductAction,
  setProductActiveAction,
  setStockAction,
} from "@/app/actions/catalogue";
import { localizedName, useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { formatMMK } from "@/lib/format";
import type { Product, ProductCategory } from "@/lib/types";

/**
 * Snacks & drinks.
 *
 * Interactive, so a client component - but not a data source: products arrive
 * as props from the server page and every change goes out through a server
 * action. No Supabase call is made from this file.
 *
 * Everything here is superadmin-only at the database. A plain admin still sees
 * the screen, because knowing what is on sale and what the stock is matters to
 * whoever is working the counter; the controls simply refuse and say why.
 */
export function ProductsView({
  products,
  canEdit,
}: {
  products: Product[];
  canEdit: boolean;
}) {
  const { t, locale } = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingStock, setEditingStock] = useState<string | null>(null);

  const [nameEn, setNameEn] = useState("");
  const [nameMy, setNameMy] = useState("");
  const [category, setCategory] = useState<ProductCategory>("drink");
  const [price, setPrice] = useState(0);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.message ?? "Could not save."));
    });

  const save = () =>
    startTransition(async () => {
      const r = await upsertProductAction({
        nameEn,
        nameMy,
        category,
        price,
        stock: 0,
      });
      if (!r.ok) {
        setError(r.message ?? "Could not save.");
        return;
      }
      setError(null);
      setNameEn("");
      setNameMy("");
      setPrice(0);
    });

  return (
    <>
      {error && (
        <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-lg border border-[#e5b8b0] bg-[#fdf3f1] px-4 py-3 text-[13px] text-[#8a3324]">
          <TriangleAlert size={16} className="mt-px flex-none" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="font-semibold underline underline-offset-2">
            {t("common.dismiss")}
          </button>
        </div>
      )}

      <div className="p-5 px-[22px] grid grid-cols-[1.6fr_1fr] gap-4 max-w-[1200px]">
        <div className="bg-surface border border-line rounded-[10px] overflow-hidden self-start">
          <div className="grid grid-cols-[2fr_1fr_1fr_.9fr_.7fr] gap-3 p-3 px-5 border-b border-line-faint text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold">
            <span>{t("products.name")}</span>
            <span>{t("products.category")}</span>
            <span className="text-right">{t("products.price")}</span>
            <span className="text-right">{t("products.stock")}</span>
            <span className="text-center">{t("products.active")}</span>
          </div>

          {products.length === 0 && (
            <div className="px-5 py-10 text-center text-text-muted text-[13px]">
              {t("products.none")}
            </div>
          )}

          {products.map((p) => (
            <div
              key={p.id}
              className={cx(
                "grid grid-cols-[2fr_1fr_1fr_.9fr_.7fr] gap-3 p-3.5 px-5 border-b border-line-hair items-center last:border-0",
                !p.active && "opacity-55",
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{localizedName(locale, p)}</div>
                <div className="mm text-xs text-text-muted truncate">{p.nameMy}</div>
              </div>
              <span
                className={cx(
                  "text-[12.5px] px-2.5 py-[3px] rounded-md justify-self-start",
                  p.category === "drink"
                    ? "bg-[#eef3fa] border border-[#dbe6f5] text-accent2"
                    : "bg-line-faint text-text-secondary",
                )}
              >
                {t(p.category === "drink" ? "cat.drink" : "cat.snack")}
              </span>
              <span className="font-mono text-[13.5px] text-right">{formatMMK(p.price)}</span>

              <StockCell
                product={p}
                canEdit={canEdit}
                editing={editingStock === p.id}
                disabled={pending}
                onEdit={() => setEditingStock(p.id)}
                onCancel={() => setEditingStock(null)}
                onSave={(v) => {
                  setEditingStock(null);
                  run(() => setStockAction(p.id, v));
                }}
              />

              <button
                onClick={() => run(() => setProductActiveAction(p.id, !p.active))}
                disabled={!canEdit || pending}
                aria-label={`${p.active ? "Delist" : "Relist"} ${p.nameEn}`}
                className={cx(
                  "justify-self-center w-[34px] h-5 rounded-full relative transition-colors disabled:opacity-45",
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

        <div className="bg-surface border border-line rounded-[10px] p-[22px] flex flex-col gap-4 self-start">
          <div className="text-[15px] font-bold flex items-center gap-2">
            <PackagePlus size={18} />
            {t("products.new")}
          </div>

          {!canEdit && (
            <p className="text-[12.5px] text-text-muted m-0 leading-relaxed">
              {t("products.superOnly")}
            </p>
          )}

          <Field label={t("products.nameEn")}>
            <input
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              placeholder="Sprite"
              disabled={!canEdit || pending}
              className="cat-input"
            />
          </Field>
          <Field label={t("products.nameMy")}>
            <input
              value={nameMy}
              onChange={(e) => setNameMy(e.target.value)}
              placeholder="စပရိုက်"
              disabled={!canEdit || pending}
              className="cat-input mm"
            />
          </Field>
          <div className="flex gap-3">
            <Field label={t("products.category")} className="flex-1">
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ProductCategory)}
                  disabled={!canEdit || pending}
                  className="cat-input appearance-none pr-8"
                >
                  <option value="drink">{t("cat.drink")}</option>
                  <option value="snack">{t("cat.snack")}</option>
                </select>
                <ChevronDown
                  size={15}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
              </div>
            </Field>
            <Field label={t("products.price")} className="flex-1">
              <input
                type="number"
                min={0}
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
                placeholder="1,000"
                disabled={!canEdit || pending}
                className="cat-input font-mono"
              />
            </Field>
          </div>
          <button
            onClick={save}
            disabled={!canEdit || pending || !nameEn.trim()}
            className="bg-ink text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-45"
          >
            {pending ? t("record.saving") : t("products.save")}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Stock is edited in place rather than in the form, because restocking is a
 * daily job done while looking at the shelf, and reopening a dialog per item
 * would make it slower than the paper it replaces.
 */
function StockCell({
  product,
  canEdit,
  editing,
  disabled,
  onEdit,
  onCancel,
  onSave,
}: {
  product: Product;
  canEdit: boolean;
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(product.stock === null ? "" : String(product.stock));

  if (!editing) {
    const low = product.stock !== null && product.stock <= 3;
    return (
      <button
        onClick={onEdit}
        disabled={!canEdit || disabled}
        className={cx(
          "font-mono text-[13.5px] text-right disabled:cursor-default",
          low ? "text-status-expired-ink font-semibold" : "text-text-secondary",
          canEdit && "hover:underline underline-offset-2",
        )}
      >
        {product.stock === null ? "—" : product.stock}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(draft === "" ? null : Number(draft));
          if (e.key === "Escape") onCancel();
        }}
        className="w-[54px] border border-line rounded-md px-1.5 py-1 font-mono text-[13px] text-right outline-none"
      />
      <button onClick={() => onSave(draft === "" ? null : Number(draft))} className="text-success" aria-label="Save stock">
        <Check size={15} />
      </button>
      <button onClick={onCancel} className="text-text-muted" aria-label="Cancel">
        <X size={15} />
      </button>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}
