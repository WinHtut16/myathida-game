"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Check, X, Pencil, Trash2 } from "lucide-react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  upsertProductAction,
  setProductActiveAction,
  setStockAction,
  deleteProductAction,
} from "@/app/actions/catalogue";
import { localizedName, useT } from "@/i18n";
import { cx, fill } from "@/lib/ui";
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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  // null = the form is in "add" mode; a product = editing that row's details.
  const [editing, setEditing] = useState<Product | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameMy, setNameMy] = useState("");
  const [category, setCategory] = useState<ProductCategory>("drink");
  const [price, setPrice] = useState(0);

  const resetForm = () => {
    setEditing(null);
    setNameEn("");
    setNameMy("");
    setCategory("drink");
    setPrice(0);
  };

  const startEdit = (p: Product) => {
    setEditing(p);
    setNameEn(p.nameEn);
    setNameMy(p.nameMy);
    setCategory(p.category);
    setPrice(p.price);
    setError(null);
  };

  /**
   * Every write re-runs the server components afterwards. revalidatePath in the
   * action marks the cache stale; router.refresh() is what actually re-fetches
   * this route - without it the Recent stock changes panel below keeps showing
   * yesterday's ledger until a manual reload.
   */
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setError(null);
        router.refresh();
      } else {
        setError(r.message ?? "Could not save.");
      }
    });

  const save = () =>
    startTransition(async () => {
      const r = await upsertProductAction({
        id: editing?.id,
        nameEn,
        nameMy,
        category,
        price,
        // Stock is edited inline (StockCell), never here - carry the row's
        // current value through an edit so it is not reset to zero.
        stock: editing ? editing.stock : 0,
      });
      if (!r.ok) {
        setError(r.message ?? "Could not save.");
        return;
      }
      setError(null);
      resetForm();
      router.refresh();
    });

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    if (editing?.id === target.id) resetForm();
    run(() => deleteProductAction(target.id));
  };

  return (
    <>
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mx-4 sm:mx-5 mt-4" />
      )}

      <div className="p-4 sm:p-5 px-4 sm:px-[22px] grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 max-w-[1200px]">
        <div className="bg-surface border border-line rounded-md overflow-hidden self-start">
          {/* Real table from md up; each row below md collapses to a two-line
              card instead — same list, no columns squeezed unreadable at
              phone width. See DESIGN.md's list pattern. */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_.9fr_1.15fr] gap-3 p-3 px-5 border-b border-line-faint text-2xs tracking-caps uppercase text-text-muted font-semibold">
            <span>{t("products.name")}</span>
            <span>{t("products.category")}</span>
            <span className="text-right">{t("products.price")}</span>
            <span className="text-right">{t("products.stock")}</span>
            <span className="text-right">{t("products.actions")}</span>
          </div>

          {products.length === 0 && (
            <div className="px-5 py-10 text-center text-text-muted text-sm">
              {t("products.none")}
            </div>
          )}

          {products.map((p) => (
            <div
              key={p.id}
              className={cx(
                "flex flex-col gap-2 p-3.5 px-4",
                "md:grid md:grid-cols-[2fr_1fr_1fr_.9fr_1.15fr] md:gap-3 md:px-5 md:items-center",
                "border-b border-line-hair last:border-0",
                editing?.id === p.id && "bg-line-faint",
                !p.active && "opacity-55",
              )}
            >
              <div className="flex items-start justify-between gap-3 md:contents">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{localizedName(locale, p)}</div>
                  <div className="mm text-xs text-text-muted truncate">{p.nameMy}</div>
                </div>
                <span
                  className={cx(
                    "text-xs px-2.5 py-[3px] rounded-md justify-self-start flex-none",
                    p.category === "drink"
                      ? "bg-accent-soft border border-accent-soft text-accent2"
                      : "bg-line-faint text-text-secondary",
                  )}
                >
                  {t(p.category === "drink" ? "cat.drink" : "cat.snack")}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 md:contents">
                <span className="tabular-nums text-sm md:text-right">{formatMMK(p.price)}</span>

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

                <div className="flex items-center justify-end gap-1.5 md:justify-self-end">
                  {canEdit && (
                    <>
                      <button
                        onClick={() => startEdit(p)}
                        disabled={pending}
                        aria-label={`Edit ${p.nameEn}`}
                        className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-line-faint disabled:opacity-45 flex-none"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDeleting(p)}
                        disabled={pending}
                        aria-label={`Delete ${p.nameEn}`}
                        className="p-1.5 rounded-md text-text-muted hover:text-status-expired-ink hover:bg-status-expired-bg disabled:opacity-45 flex-none"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => run(() => setProductActiveAction(p.id, !p.active))}
                    disabled={!canEdit || pending}
                    aria-label={`${p.active ? "Delist" : "Relist"} ${p.nameEn}`}
                    className={cx(
                      "w-[34px] h-5 rounded-full relative transition-colors disabled:opacity-45 flex-none",
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
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-line rounded-md p-4 sm:p-[22px] flex flex-col gap-4 self-start">
          <div className="flex items-center justify-between gap-2">
            <div className="text-md font-bold flex items-center gap-2">
              <PackagePlus size={18} />
              {editing ? t("products.edit") : t("products.new")}
            </div>
            {editing && (
              <button
                onClick={resetForm}
                disabled={pending}
                className="text-xs font-semibold text-text-secondary hover:text-accent"
              >
                {t("products.new")}
              </button>
            )}
          </div>

          {!canEdit && (
            <p className="text-xs text-text-muted m-0 leading-relaxed">
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
              {/* The caret comes from the global select.cat-input rule now,
                  so this no longer draws its own on top of it. */}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                disabled={!canEdit || pending}
                className="cat-input"
              >
                <option value="drink">{t("cat.drink")}</option>
                <option value="snack">{t("cat.snack")}</option>
              </select>
            </Field>
            <Field label={t("products.price")} className="flex-1">
              <input
                type="number"
                min={0}
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
                placeholder="1,000"
                disabled={!canEdit || pending}
                className="cat-input tabular-nums"
              />
            </Field>
          </div>
          <button
            onClick={save}
            disabled={!canEdit || pending || !nameEn.trim()}
            className="bg-accent text-white rounded-md hover:bg-accent-strong transition-colors py-3 text-sm font-semibold disabled:opacity-45"
          >
            {pending ? t("record.saving") : editing ? t("products.saveChanges") : t("products.save")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        variant="danger"
        title={t("products.deleteTitle")}
        message={
          deleting
            ? fill(t("products.deleteMessage"), { name: deleting.nameEn })
            : ""
        }
        confirmLabel={t("products.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        isLoading={pending}
      />
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
    const value = product.stock === null ? "—" : product.stock;

    // A plain admin can't restock, so the number is just a number.
    if (!canEdit) {
      return (
        <span
          className={cx(
            "tabular-nums text-sm md:text-right md:justify-self-end",
            low ? "text-status-expired-ink font-semibold" : "text-text-secondary",
          )}
        >
          {value}
        </span>
      );
    }

    // For a superadmin it's an editable field: a bordered chip with a pencil,
    // so it reads as "tap to change" without needing to be discovered on hover.
    return (
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        aria-label={`Edit stock for ${product.nameEn}`}
        className={cx(
          "group inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
          "tabular-nums text-sm transition-colors md:justify-self-end disabled:opacity-45",
          low
            ? "border-status-expired-bd bg-status-expired-bg text-status-expired-ink font-semibold hover:border-status-expired"
            : "border-line bg-surface-sunken text-text-secondary hover:border-accent hover:text-accent",
        )}
      >
        {value}
        <Pencil size={12} className="text-text-muted transition-colors group-hover:text-accent" />
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
        className="w-[54px] border border-line rounded-md px-1.5 py-1 tabular-nums text-sm text-right outline-none"
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
      <div className="text-2xs tracking-caps uppercase text-text-muted font-semibold mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}
