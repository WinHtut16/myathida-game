"use client";

import { useStore } from "@/lib/data/store";
import { cx } from "@/lib/ui";

/** EN / မြန်မာ segmented toggle. `variant` matches the two surfaces it sits on. */
export function LanguageSwitch({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { state, dispatch } = useStore();
  const locale = state.locale;

  const wrap =
    variant === "dark"
      ? "bg-[#1b1e24] rounded-lg p-[3px]"
      : "bg-line-faint border border-line-soft rounded-lg p-[3px]";
  const on = variant === "dark" ? "bg-[#3b3f47] text-white" : "bg-ink text-white";
  const off = variant === "dark" ? "text-[#9aa0aa]" : "text-text-secondary";

  return (
    <div className={cx("flex text-[12.5px] font-semibold", wrap)}>
      <button
        onClick={() => dispatch({ type: "SET_LOCALE", locale: "en" })}
        className={cx("flex-1 text-center rounded-md px-3.5 py-1.5", locale === "en" ? on : off)}
      >
        EN
      </button>
      <button
        onClick={() => dispatch({ type: "SET_LOCALE", locale: "my" })}
        className={cx("mm flex-1 text-center rounded-md px-3.5 py-1.5", locale === "my" ? on : off)}
      >
        မြန်မာ
      </button>
    </div>
  );
}
