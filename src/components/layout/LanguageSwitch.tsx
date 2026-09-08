"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { cx } from "@/lib/ui";

/** EN / မြန်မာ segmented toggle. `variant` matches the two surfaces it sits on. */
export function LanguageSwitch({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { locale, setLocale } = useLocale();

  const wrap =
    variant === "dark"
      ? "bg-rail-hover rounded-md p-[3px]"
      : "bg-line-faint border border-line-soft rounded-md p-[3px]";
  const on = variant === "dark" ? "bg-accent text-white" : "bg-accent text-white";
  const off = variant === "dark" ? "text-rail-faint" : "text-text-secondary";

  return (
    <div className={cx("flex text-xs font-semibold", wrap)}>
      <button
        onClick={() => setLocale("en")}
        className={cx("flex-1 text-center rounded-md px-3.5 py-1.5", locale === "en" ? on : off)}
      >
        EN
      </button>
      <button
        onClick={() => setLocale("my")}
        className={cx("mm flex-1 text-center rounded-md px-3.5 py-1.5", locale === "my" ? on : off)}
      >
        မြန်မာ
      </button>
    </div>
  );
}
