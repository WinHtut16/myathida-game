"use client";

import { Share, MoreVertical, MonitorDown } from "lucide-react";
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

  const [title, steps, Icon] =
    platform === "ios"
      ? [t("account.installIosTitle"), t("account.installIosSteps"), Share]
      : platform === "macos"
        ? [t("account.installMacTitle"), t("account.installMacSteps"), MoreVertical]
        : [t("account.installOtherTitle"), t("account.installOtherSteps"), MonitorDown];

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-text-secondary leading-relaxed">{steps}</p>
      <div className="flex items-center justify-center gap-2 py-4 text-text-muted">
        <Icon size={28} />
      </div>
    </Dialog>
  );
}
