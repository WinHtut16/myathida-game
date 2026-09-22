"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { useT } from "@/i18n";
import { useInstallPrompt } from "@/lib/pwa/useInstallPrompt";
import { InstallInstructionsDialog } from "@/components/pwa/InstallInstructionsDialog";

/** Permanent "Install app" entry on the Account page. Always renders a
 * button when not yet installed: `beforeinstallprompt` only sometimes fires
 * by the time this mounts (browser heuristics, timing, a prior dismissal
 * this session), so gating visibility on `canPrompt` made the row silently
 * vanish on Windows/Android whenever that event hadn't landed yet. The
 * fallback "How to Install" always has somewhere to send the user, via
 * InstallInstructionsDialog's platform-specific (including generic
 * Chrome/Edge) instructions. */
export function InstallAppRow() {
  const { t } = useT();
  const { platform, isStandalone, canPrompt, promptInstall } = useInstallPrompt();
  const [showInstructions, setShowInstructions] = useState(false);

  async function handleAction() {
    if (canPrompt) {
      await promptInstall();
    } else {
      setShowInstructions(true);
    }
  }

  return (
    <div className="bg-surface border border-line rounded-lg p-[22px]">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-8 h-8 rounded-lg bg-line-faint flex items-center justify-center text-text-muted">
          {isStandalone ? <Check size={16} /> : <Download size={16} />}
        </span>
        <h2 className="text-md font-bold m-0">{t("account.install")}</h2>
      </div>

      {isStandalone ? (
        <p className="text-xs text-text-secondary leading-relaxed m-0">{t("account.installed")}</p>
      ) : (
        <button
          onClick={handleAction}
          className="bg-surface text-text border border-line rounded-md hover:bg-line-faint transition-colors px-4 py-2 text-xs font-semibold"
        >
          {canPrompt ? t("account.install") : t("account.installHow")}
        </button>
      )}

      <InstallInstructionsDialog
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
        platform={platform}
      />
    </div>
  );
}
