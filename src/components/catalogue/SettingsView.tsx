"use client";

import { useState, useTransition } from "react";
import { Plus, Shield, User, Wrench, ExternalLink } from "lucide-react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { upsertStationAction, setStationStatusAction } from "@/app/actions/stations";
import { TierBadge } from "@/components/station/TierBadge";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import type { Station, Tier } from "@/lib/types";

const TIERS: Tier[] = ["PS4", "PS5", "VIP"];

export interface StaffRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  active: boolean;
}

export function SettingsView({
  stations,
  staff,
  canEdit,
}: {
  stations: Station[];
  staff: StaffRow[];
  canEdit: boolean;
}) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.message ?? "Could not save."));
    });

  const addStation = () =>
    run(() =>
      upsertStationAction({
        name: `TV ${stations.length + 1}`,
        tier: "PS4",
        status: "available",
      }),
    );

  return (
    <>
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mx-4 sm:mx-5 mt-4" />
      )}

      <div className="p-4 sm:p-5 px-4 sm:px-[22px] grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 max-w-[1200px]">
        {/* ── floor plan ────────────────────────────────────────────────── */}
        <div className="bg-surface border border-line rounded-[10px] overflow-hidden self-start">
          <div className="p-4 px-5 border-b border-line-faint flex items-center justify-between">
            <span className="text-[15px] font-bold">{t("settings.stations")}</span>
            {canEdit && (
              <button
                onClick={addStation}
                disabled={pending}
                className="flex items-center gap-1.5 bg-ink text-white rounded-[7px] px-3 py-2 text-[12.5px] font-semibold disabled:opacity-45"
              >
                <Plus size={14} />
                {t("settings.addStation")}
              </button>
            )}
          </div>

          <div className="hidden md:grid grid-cols-[1.3fr_1fr_1.1fr] gap-2.5 p-2.5 px-5 border-b border-line-faint text-[11px] tracking-[.09em] uppercase text-text-muted font-semibold">
            <span>{t("products.name")}</span>
            <span>{t("settings.tier")}</span>
            <span>{t("settings.status")}</span>
          </div>

          {stations.map((s) => (
            <StationRow
              key={s.id}
              station={s}
              canEdit={canEdit}
              disabled={pending}
              onError={setError}
              onRun={run}
            />
          ))}
        </div>

        {/* ── people + language ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-line rounded-[10px] overflow-hidden">
            <div className="p-4 px-5 border-b border-line-faint flex items-center justify-between">
              <span className="text-[15px] font-bold">{t("settings.admins")}</span>
              {!canEdit && (
                <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <Shield size={12} />
                  {t("settings.superOnly")}
                </span>
              )}
            </div>

            {staff.length === 0 && (
              <div className="px-5 py-8 text-center text-[13px] text-text-muted">
                {t("settings.noStaff")}
              </div>
            )}

            {staff.map((st) => (
              <div
                key={st.id}
                className={cx(
                  "p-3 px-5 border-b border-line-hair flex items-center justify-between",
                  !st.active && "opacity-55",
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-[30px] h-[30px] rounded-full bg-line-faint flex items-center justify-center text-text-muted flex-none">
                    <User size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{st.name}</div>
                    <div className="text-[11.5px] text-text-muted truncate">
                      {t(st.role === "superadmin" ? "role.superadmin" : "role.admin")}
                      {st.phone ? ` · ${st.phone}` : st.email ? ` · ${st.email}` : ""}
                    </div>
                  </div>
                </div>
                {!st.active && (
                  <span className="text-[11px] text-text-muted flex-none">
                    {t("settings.inactive")}
                  </span>
                )}
              </div>
            ))}

            {/*
              Adding and removing people happens in the main admin panel, not
              here, and that is not a shortcut. Reaching the game shop at all
              requires a profiles row on the hub as well as the grant and the
              local staff row - the hub's middleware checks that first. A
              create form here could only write two of the three, producing an
              account that looks made and is bounced at the door.

              A plain <a>, not next/link: this app has basePath /admin/game, and
              Link would prepend it and send them to /admin/game/admin/staff.
            */}
            <div className="p-4 px-5 bg-[#fafbfc] border-t border-line-faint">
              <p className="text-[12px] text-text-secondary leading-relaxed m-0 mb-2.5">
                {t("settings.manageStaffHint")}
              </p>
              <a
                href="/admin/staff"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent2 hover:underline"
              >
                {t("settings.manageStaffLink")}
                <ExternalLink size={13} />
              </a>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-[10px] p-[18px] px-5">
            <div className="text-[15px] font-bold mb-3">{t("settings.defaultLanguage")}</div>
            <LanguageSwitch variant="light" />
          </div>
        </div>
      </div>
    </>
  );
}

function StationRow({
  station,
  canEdit,
  disabled,
  onError,
  onRun,
}: {
  station: Station;
  canEdit: boolean;
  disabled: boolean;
  onError: (m: string | null) => void;
  onRun: (fn: () => Promise<{ ok: boolean; message?: string }>) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(station.name);
  const maint = station.status === "maintenance";

  const commitName = () => {
    const next = name.trim();
    if (!next || next === station.name) {
      setName(station.name);
      return;
    }
    onRun(() =>
      upsertStationAction({
        id: station.id,
        name: next,
        tier: station.tier,
        status: station.status,
      }),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 p-3 px-4 md:grid md:grid-cols-[1.3fr_1fr_1.1fr] md:px-5 border-b border-line-hair text-sm last:border-0">
      {canEdit ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setName(station.name);
              e.currentTarget.blur();
            }
          }}
          disabled={disabled}
          className="font-semibold border border-transparent hover:border-line focus:border-line rounded-md px-2 py-1 -ml-2 outline-none bg-transparent w-full"
        />
      ) : (
        <span className="font-semibold w-full md:w-auto">{station.name}</span>
      )}

      {canEdit ? (
        <select
          value={station.tier}
          disabled={disabled}
          onChange={(e) =>
            onRun(() =>
              upsertStationAction({
                id: station.id,
                name: station.name,
                tier: e.target.value as Tier,
                status: station.status,
              }),
            )
          }
          className="field !py-1 !px-2 !text-[13px] w-[104px] disabled:opacity-45"
        >
          {TIERS.map((tr) => (
            <option key={tr} value={tr}>
              {tr}
            </option>
          ))}
        </select>
      ) : (
        <span className="justify-self-start">
          <TierBadge tier={station.tier} />
        </span>
      )}

      <button
        onClick={() =>
          onRun(() =>
            setStationStatusAction(station.id, maint ? "available" : "maintenance"),
          )
        }
        disabled={!canEdit || disabled}
        className={cx(
          "text-xs flex items-center gap-1.5 justify-self-start disabled:cursor-default",
          maint ? "text-status-warn-deep" : "text-status-active-ink",
          canEdit && "hover:underline underline-offset-2",
        )}
      >
        {maint ? <Wrench size={12} /> : null}
        {maint ? t("floor.maintenance") : t("settings.available")}
      </button>
    </div>
  );
}
