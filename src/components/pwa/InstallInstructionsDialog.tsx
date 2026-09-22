"use client";

import { Share, MoreVertical } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useT } from "@/i18n";
import type { InstallPlatform } from "@/lib/pwa/useInstallPrompt";

export function InstallInstructionsDialog({
  open,
  onClose,
  platform,
}: {
  open: boolean;
  onClose: () => void;
  platform: InstallPlatform;
}) {
  const { t } = useT();
  const isIos = platform === "ios";

  return (
    <Dialog open={open} onClose={onClose} title={isIos ? t("account.installIosTitle") : t("account.installMacTitle")}>
      <p className="text-sm text-text-secondary leading-relaxed">
        {isIos ? t("account.installIosSteps") : t("account.installMacSteps")}
      </p>
      <div className="flex items-center justify-center gap-2 py-4 text-text-muted">
        {isIos ? <Share size={28} /> : <MoreVertical size={28} />}
      </div>
    </Dialog>
  );
}
