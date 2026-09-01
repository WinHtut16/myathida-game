"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, TriangleAlert, ExternalLink } from "lucide-react";
import { updateOwnProfileAction } from "@/app/actions/profile";
import { useLocale } from "@/i18n/LocaleProvider";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import type { Locale } from "@/lib/types";

export function AccountView({
  name: initialName,
  role,
}: {
  name: string;
  role: string;
}) {
  const { t } = useT();
  const { locale, setLocale } = useLocale();
  const [name, setName] = useState(initialName);
  const [draftLocale, setDraftLocale] = useState<Locale>(locale);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== initialName || draftLocale !== locale;

  const save = () =>
    startTransition(async () => {
      const r = await updateOwnProfileAction(name, draftLocale);
      if (!r.ok) {
        setError(r.message ?? "Could not save.");
        return;
      }
      setError(null);
      // Mirror the saved language into the cookie the UI reads, so the change
      // shows immediately instead of on the next sign-in.
      setLocale(draftLocale);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  return (
    <div className="p-5 px-[22px] max-w-[620px] flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[#e5b8b0] bg-[#fdf3f1] px-4 py-3 text-[13px] text-[#8a3324]">
          <TriangleAlert size={16} className="mt-px flex-none" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="font-semibold underline underline-offset-2">
            {t("common.dismiss")}
          </button>
        </div>
      )}

      <div className="bg-surface border border-line rounded-[11px] p-[22px]">
        <h2 className="text-[15px] font-bold m-0 mb-1">{t("account.yourDetails")}</h2>
        <p className="text-[12.5px] text-text-muted m-0 mb-5">{t("account.detailsHint")}</p>

        <label className="block mb-4">
          <span className="block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
            {t("account.displayName")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="cat-input"
          />
          <span className="block text-[11.5px] text-text-muted mt-1.5">
            {t("account.displayNameHint")}
          </span>
        </label>

        <div className="mb-5">
          <span className="block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
            {t("account.language")}
          </span>
          <div className="flex bg-line-faint border border-line-soft rounded-lg p-[3px] text-[12.5px] font-semibold w-[180px]">
            {(["en", "my"] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setDraftLocale(l)}
                disabled={pending}
                className={cx(
                  "flex-1 text-center rounded-md px-3.5 py-1.5",
                  l === "my" && "mm",
                  draftLocale === l ? "bg-ink text-white" : "text-text-secondary",
                )}
              >
                {l === "en" ? "EN" : "မြန်မာ"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending || !dirty || !name.trim()}
            className="bg-ink text-white rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-45"
          >
            {pending ? t("record.saving") : t("account.save")}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-[13px] text-status-active-ink">
              <Check size={15} />
              {t("pricing.saved")}
            </span>
          )}
          <span className="ml-auto text-[12px] text-text-muted">
            {t(role === "superadmin" ? "role.superadmin" : "role.admin")}
          </span>
        </div>
      </div>

      {/*
        Password lives on the hub, and so does the account itself. Duplicating
        a password form here would mean this app handling credentials for an
        account it does not own - so it points at the one place that does.
        Plain <a>: /admin/profile is outside this app's basePath.
      */}
      <div className="bg-surface border border-line rounded-[11px] p-[22px]">
        <div className="flex items-center gap-2.5 mb-2">
          <span className="w-8 h-8 rounded-lg bg-line-faint flex items-center justify-center text-text-muted">
            <KeyRound size={16} />
          </span>
          <h2 className="text-[15px] font-bold m-0">{t("account.password")}</h2>
        </div>
        <p className="text-[12.5px] text-text-secondary leading-relaxed m-0 mb-3">
          {t("account.passwordHint")}
        </p>
        <a
          href="/admin/profile"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent2 hover:underline"
        >
          {t("account.passwordLink")}
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
