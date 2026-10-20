"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Gamepad2, ImagePlus, Pencil, Star, Trash2, Users } from "lucide-react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  deleteTitleAction,
  reorderTitlesAction,
  setTitleVisibleAction,
  uploadCoverAction,
  upsertTitleAction,
} from "@/app/actions/titles";
import { useT } from "@/i18n";
import { cx, fill } from "@/lib/ui";
import { TITLE_GENRES, type GameTitle, type TitleGenre, type TitlePlatform } from "@/lib/types";

/**
 * Games on the shelf. Same shape as the Snacks screen: the list on the left,
 * the add/edit form on the right, every change through a server action. Any
 * active game staff can edit (RLS: titles_write_staff). Shown titles appear on
 * the park's public /games page in this order.
 */
export function TitlesView({ titles }: { titles: GameTitle[] }) {
  const { t } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<GameTitle | null>(null);

  const [editing, setEditing] = useState<GameTitle | null>(null);
  const [title, setTitle] = useState("");
  const [platforms, setPlatforms] = useState<TitlePlatform[]>(["PS5"]);
  const [genre, setGenre] = useState<TitleGenre>("action");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [isPopular, setIsPopular] = useState(false);
  const [descriptionEn, setDescriptionEn] = useState("");
  const [descriptionMy, setDescriptionMy] = useState("");
  const [localCoop, setLocalCoop] = useState(false);
  const [online, setOnline] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setPlatforms(["PS5"]);
    setGenre("action");
    setMaxPlayers(2);
    setCoverUrl(null);
    setIsNew(false);
    setIsPopular(false);
    setDescriptionEn("");
    setDescriptionMy("");
    setLocalCoop(false);
    setOnline(false);
    setFeatured(false);
  };

  const startEdit = (g: GameTitle) => {
    setEditing(g);
    setTitle(g.title);
    setPlatforms(g.platforms);
    setGenre(g.genre);
    setMaxPlayers(g.maxPlayers);
    setCoverUrl(g.coverUrl);
    setIsNew(g.isNew);
    setIsPopular(g.isPopular);
    setDescriptionEn(g.descriptionEn ?? "");
    setDescriptionMy(g.descriptionMy ?? "");
    setLocalCoop(g.localCoop);
    setOnline(g.online);
    setFeatured(g.featured);
    setError(null);
  };

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
      const r = await upsertTitleAction({
        id: editing?.id,
        title,
        platforms,
        genre,
        maxPlayers,
        coverUrl,
        isNew,
        isPopular,
        descriptionEn,
        descriptionMy,
        localCoop,
        online,
        featured,
      });
      if (!r.ok) {
        setError(r.message ?? "Could not save.");
        return;
      }
      setError(null);
      resetForm();
      router.refresh();
    });

  const move = (index: number, dir: -1 | 1) => {
    const ids = titles.map((g) => g.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    run(() => reorderTitlesAction(ids));
  };

  const togglePlatform = (p: TitlePlatform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort() as TitlePlatform[]));

  const onPickCover = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const small = await shrinkImage(file);
      const form = new FormData();
      form.append("file", small, "cover");
      const r = await uploadCoverAction(form);
      if (r.ok && r.url) setCoverUrl(r.url);
      else setError(r.message ?? "Upload failed.");
    } catch {
      setError("Could not read that image. Try a JPEG or PNG.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    if (editing?.id === target.id) resetForm();
    run(() => deleteTitleAction(target.id));
  };

  const busy = pending || uploading;

  return (
    <>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} className="mx-4 sm:mx-5 mt-4" />}

      <div className="p-4 sm:p-5 px-4 sm:px-[22px] grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 max-w-[1200px]">
        <div className="flex flex-col gap-3 self-start">
          <p className="text-xs text-text-muted m-0 leading-relaxed">{t("titles.publicNote")}</p>
          <div className="bg-surface border border-line rounded-md overflow-hidden">
            {titles.length === 0 && (
              <div className="px-5 py-10 text-center text-text-muted text-sm">{t("titles.none")}</div>
            )}

            {titles.map((g, i) => (
              <div
                key={g.id}
                className={cx(
                  "flex items-center gap-3 p-3 px-4 border-b border-line-hair last:border-0",
                  editing?.id === g.id && "bg-line-faint",
                  !g.visible && "opacity-55",
                )}
              >
                <Cover url={g.coverUrl} className="w-[42px] h-[56px]" />

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{g.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                    {g.platforms.map((p) => (
                      <span key={p} className="px-1.5 py-[1px] rounded border border-line bg-surface-sunken font-semibold">
                        {p}
                      </span>
                    ))}
                    <span>{t(`genre.${g.genre}` as never)}</span>
                    <span className="inline-flex items-center gap-1 text-text-muted">
                      <Users size={12} />
                      {g.maxPlayers}
                    </span>
                    {g.featured && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded bg-accent text-white font-semibold">
                        <Star size={11} />
                        {t("titles.flagFeatured")}
                      </span>
                    )}
                    {g.localCoop && (
                      <span className="px-1.5 py-[1px] rounded border border-line text-text-secondary">{t("titles.flagCoop")}</span>
                    )}
                    {g.isNew && (
                      <span className="px-1.5 py-[1px] rounded bg-accent-soft text-accent2 font-semibold">{t("titles.flagNew")}</span>
                    )}
                    {g.isPopular && (
                      <span className="px-1.5 py-[1px] rounded bg-line-faint text-text-secondary font-semibold">
                        {t("titles.flagPopular")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-0.5 flex-none">
                  <IconBtn label={`${t("titles.moveUp")}: ${g.title}`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp size={15} />
                  </IconBtn>
                  <IconBtn
                    label={`${t("titles.moveDown")}: ${g.title}`}
                    disabled={busy || i === titles.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={15} />
                  </IconBtn>
                  <IconBtn label={`${t("titles.edit")}: ${g.title}`} disabled={busy} onClick={() => startEdit(g)}>
                    <Pencil size={15} />
                  </IconBtn>
                  <IconBtn label={`${t("products.deleteConfirm")}: ${g.title}`} disabled={busy} onClick={() => setDeleting(g)} danger>
                    <Trash2 size={15} />
                  </IconBtn>
                  <button
                    onClick={() => run(() => setTitleVisibleAction(g.id, !g.visible))}
                    disabled={busy}
                    role="switch"
                    aria-checked={g.visible}
                    aria-label={`${g.visible ? t("titles.hide") : t("titles.show")}: ${g.title}`}
                    title={g.visible ? t("titles.shown") : t("titles.hidden")}
                    className={cx(
                      "ml-1 w-[34px] h-5 rounded-full relative transition-colors disabled:opacity-45 flex-none",
                      g.visible ? "bg-success" : "bg-line",
                    )}
                  >
                    <span
                      className={cx(
                        "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all",
                        g.visible ? "right-0.5" : "left-0.5",
                      )}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-line rounded-md p-4 sm:p-[22px] flex flex-col gap-4 self-start">
          <div className="flex items-center justify-between gap-2">
            <div className="text-md font-bold flex items-center gap-2">
              <Gamepad2 size={18} />
              {editing ? t("titles.edit") : t("titles.new")}
            </div>
            {editing && (
              <button
                onClick={resetForm}
                disabled={busy}
                className="text-xs font-semibold text-text-secondary hover:text-accent"
              >
                {t("titles.new")}
              </button>
            )}
          </div>

          <Field label={t("titles.title")}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="EA Sports FC 25"
              maxLength={80}
              disabled={busy}
              className="cat-input"
            />
          </Field>

          <Field label={t("titles.platforms")}>
            <div className="flex gap-2">
              {(["PS4", "PS5"] as const).map((p) => {
                const on = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePlatform(p)}
                    disabled={busy}
                    className={cx(
                      "flex-1 rounded-md border py-2.5 text-sm font-semibold transition-colors disabled:opacity-45",
                      on ? "border-accent bg-accent-soft text-accent2" : "border-line text-text-secondary hover:border-accent",
                    )}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="flex gap-3">
            <Field label={t("titles.genre")} className="flex-1">
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value as TitleGenre)}
                disabled={busy}
                className="cat-input"
              >
                {TITLE_GENRES.map((g) => (
                  <option key={g} value={g}>
                    {t(`genre.${g}` as never)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("titles.players")} className="flex-1">
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                disabled={busy}
                className="cat-input"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {fill(t("titles.playersN"), { n })}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label={t("titles.cover")}>
            <div className="flex items-center gap-3">
              <Cover url={coverUrl} className="w-[60px] h-[80px]" />
              <div className="flex flex-col items-start gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  id="title-cover"
                  onChange={(e) => onPickCover(e.target.files?.[0])}
                  disabled={busy}
                />
                <label
                  htmlFor="title-cover"
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm font-semibold text-text-secondary",
                    busy ? "opacity-45" : "cursor-pointer hover:border-accent hover:text-accent",
                  )}
                >
                  <ImagePlus size={15} />
                  {uploading ? t("titles.coverUploading") : coverUrl ? t("titles.coverChange") : t("titles.coverUpload")}
                </label>
                {coverUrl && !uploading && (
                  <button
                    type="button"
                    onClick={() => setCoverUrl(null)}
                    disabled={busy}
                    className="text-xs font-semibold text-text-muted hover:text-status-expired-ink"
                  >
                    {t("titles.coverRemove")}
                  </button>
                )}
                <span className="text-xs text-text-muted">{t("titles.coverHint")}</span>
              </div>
            </div>
          </Field>

          <Field label={t("titles.flags")}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Check label={t("titles.flagFeatured")} checked={featured} onChange={setFeatured} disabled={busy} />
              <Check label={t("titles.flagNew")} checked={isNew} onChange={setIsNew} disabled={busy} />
              <Check label={t("titles.flagPopular")} checked={isPopular} onChange={setIsPopular} disabled={busy} />
              <Check label={t("titles.flagCoop")} checked={localCoop} onChange={setLocalCoop} disabled={busy} />
              <Check label={t("titles.flagOnline")} checked={online} onChange={setOnline} disabled={busy} />
            </div>
            <p className="text-xs text-text-muted m-0 mt-2 leading-relaxed">{t("titles.flagsHint")}</p>
          </Field>

          <Field label={t("titles.descriptionEn")}>
            <Description value={descriptionEn} onChange={setDescriptionEn} disabled={busy} placeholder="Build your dream club and play head to head on one screen." />
          </Field>
          <Field label={t("titles.descriptionMy")}>
            <Description value={descriptionMy} onChange={setDescriptionMy} disabled={busy} className="mm" placeholder="တစ်မျက်နှာပြင်တည်းမှာ နှစ်ယောက် ယှဉ်ကစားနိုင်ပါသည်။" />
          </Field>

          <button
            onClick={save}
            disabled={busy || !title.trim() || platforms.length === 0}
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
        title={t("titles.deleteTitle")}
        message={deleting ? fill(t("titles.deleteMessage"), { name: deleting.title }) : ""}
        confirmLabel={t("products.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        isLoading={pending}
      />
    </>
  );
}

/**
 * Phone photos of box art are several MB; the upload goes through a Server
 * Action (1 MB body limit) and only ever shows at card size. Downscale to
 * 600 px on the long edge and re-encode before sending.
 */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const blob = (await toBlob("image/webp")) ?? (await toBlob("image/jpeg"));
  if (!blob) throw new Error("encode failed");
  return blob;
}

function Cover({ url, className }: { url: string | null; className: string }) {
  return url ? (
    // Cloudinary already serves this resized; next/image would add nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cx("rounded object-cover bg-line-faint flex-none", className)} />
  ) : (
    <span className={cx("rounded bg-line-faint text-text-muted grid place-items-center flex-none", className)}>
      <Gamepad2 size={18} />
    </span>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cx(
        "p-1.5 rounded-md text-text-muted disabled:opacity-30 flex-none",
        danger ? "hover:text-status-expired-ink hover:bg-status-expired-bg" : "hover:text-accent hover:bg-line-faint",
      )}
    >
      {children}
    </button>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 accent-[var(--game-accent)]"
      />
      {label}
    </label>
  );
}

/** Short description with a live character count (the database caps it at 400). */
function Description({
  value,
  onChange,
  disabled,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  className?: string;
}) {
  const left = 400 - value.length;
  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 400))}
        disabled={disabled}
        rows={3}
        placeholder={placeholder}
        className={cx("cat-input resize-y min-h-[84px] leading-relaxed", className)}
      />
      <span className={cx("absolute bottom-2 right-2.5 text-2xs tabular-nums", left < 40 ? "text-status-expired-ink" : "text-text-muted")}>
        {left}
      </span>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-2xs tracking-caps uppercase text-text-muted font-semibold mb-1.5">{label}</div>
      {children}
    </div>
  );
}
