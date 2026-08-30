"use client";

import { useState } from "react";
import { Plus, Shield, User, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useStore } from "@/lib/data/store";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";
import { TierBadge } from "@/components/station/TierBadge";
import { LanguageSwitch } from "@/components/layout/LanguageSwitch";
import type { Tier } from "@/lib/types";

const TIERS: Tier[] = ["PS4", "PS5", "VIP"];

export default function SettingsPage() {
  const { t } = useT();
  const { state, dispatch, isSuperadmin } = useStore();
  const superadmin = isSuperadmin();
  const stations = [...state.stations].sort((a, b) => a.sortOrder - b.sortOrder);
  const admins = state.staff.filter((s) => s.role === "admin");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const addStation = () => {
    const next = stations.length + 1;
    dispatch({
      type: "UPSERT_STATION",
      station: { id: `st_${Math.random().toString(36).slice(2, 8)}`, name: `TV ${next}`, tier: "PS4", status: "available", occupied: false, sortOrder: next },
    });
  };

  const createAdmin = () => {
    if (!name.trim() || !phone.trim()) return;
    dispatch({ type: "CREATE_ADMIN", name: name.trim(), phone: phone.trim() });
    setName("");
    setPhone("");
    setPassword("");
  };

  return (
    <AppShell title={t("nav.settings")}>
      <div className="p-5 px-[22px] grid grid-cols-[1.4fr_1fr] gap-4 max-w-[1200px]">
        {/* stations */}
        <div className="bg-surface border border-line rounded-[10px] overflow-hidden self-start">
          <div className="p-4 px-5 border-b border-line-faint flex items-center justify-between">
            <span className="text-[15px] font-bold">{t("settings.stations")}</span>
            {superadmin && (
              <button onClick={addStation} className="flex items-center gap-1.5 bg-ink text-white rounded-[7px] px-3 py-2 text-[12.5px] font-semibold">
                <Plus size={14} />
                {t("settings.addStation")}
              </button>
            )}
          </div>
          <div className="grid grid-cols-[1.2fr_1.2fr_1.2fr_.5fr] gap-2.5 p-2.5 px-5 border-b border-line-faint text-[11px] tracking-[.09em] uppercase text-text-muted font-semibold">
            <span>{t("products.name")}</span>
            <span>{t("settings.tier")}</span>
            <span>{t("settings.status")}</span>
            <span />
          </div>
          {stations.map((s) => (
            <div key={s.id} className="grid grid-cols-[1.2fr_1.2fr_1.2fr_.5fr] gap-2.5 p-3 px-5 border-b border-line-hair items-center text-sm">
              <span className="font-semibold">{s.name}</span>
              {superadmin ? (
                <select
                  value={s.tier}
                  onChange={(e) => dispatch({ type: "UPSERT_STATION", station: { ...s, tier: e.target.value as Tier } })}
                  className="border border-line rounded-md px-2 py-1 text-[13px] bg-white w-[90px]"
                >
                  {TIERS.map((tr) => (
                    <option key={tr} value={tr}>
                      {tr}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="justify-self-start">
                  <TierBadge tier={s.tier} />
                </span>
              )}
              <button
                onClick={() => superadmin && dispatch({ type: "SET_STATION_STATUS", stationId: s.id, status: s.status === "maintenance" ? "available" : "maintenance" })}
                className={cx("text-xs flex items-center gap-1.5 justify-self-start", s.status === "maintenance" ? "text-status-warn-deep" : "text-status-active-ink")}
                disabled={!superadmin}
              >
                {s.status === "maintenance" ? <Wrench size={12} /> : null}
                {s.status === "maintenance" ? t("floor.maintenance") : t("settings.available")}
              </button>
              <span />
            </div>
          ))}
        </div>

        {/* admins + language */}
        <div className="flex flex-col gap-4">
          <div className="bg-surface border border-line rounded-[10px] overflow-hidden">
            <div className="p-4 px-5 border-b border-line-faint flex items-center justify-between">
              <span className="text-[15px] font-bold">{t("settings.admins")}</span>
              {!superadmin && (
                <span className="flex items-center gap-1 text-[11px] text-text-muted">
                  <Shield size={12} />
                  {t("settings.superOnly")}
                </span>
              )}
            </div>
            {state.staff.map((st) => (
              <div key={st.id} className="p-3 px-5 border-b border-line-hair flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-[30px] h-[30px] rounded-full bg-line-faint flex items-center justify-center text-text-muted">
                    <User size={14} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{st.name}</div>
                    <div className="text-[11.5px] text-text-muted">
                      {t(st.role === "superadmin" ? "role.superadmin" : "role.admin")}
                      {st.phone ? ` · ${st.phone}` : st.email ? ` · ${st.email}` : ""}
                    </div>
                  </div>
                </div>
                {st.role === "admin" && superadmin && (
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_ADMIN", id: st.id })}
                    className={cx("w-[34px] h-5 rounded-full relative", st.active ? "bg-success" : "bg-line")}
                    aria-label="toggle active"
                  >
                    <span className={cx("absolute top-0.5 w-4 h-4 bg-white rounded-full", st.active ? "right-0.5" : "left-0.5")} />
                  </button>
                )}
              </div>
            ))}

            {superadmin && (
              <div className="p-4 px-5 flex flex-col gap-2.5 bg-[#fafbfc]">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.adminName")} className="border border-line rounded-lg px-3 py-2 text-sm outline-none" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("settings.adminPhone")} className="border border-line rounded-lg px-3 py-2 text-sm outline-none font-mono" />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t("settings.adminPassword")} className="border border-line rounded-lg px-3 py-2 text-sm outline-none" />
                <button onClick={createAdmin} className="bg-ink text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5">
                  <Plus size={14} />
                  {t("settings.addAdmin")}
                </button>
              </div>
            )}
          </div>

          <div className="bg-surface border border-line rounded-[10px] p-[18px] px-5">
            <div className="text-[15px] font-bold mb-3">{t("settings.defaultLanguage")}</div>
            <LanguageSwitch variant="light" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
