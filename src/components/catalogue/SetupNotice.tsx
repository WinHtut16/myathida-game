import { TriangleAlert } from "lucide-react";

/** Shared "this screen cannot read its data" panel. */
export function SetupNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-6">
      <div className="max-w-[560px] bg-surface border border-line rounded-xl p-5 flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-status-expired-bg text-status-expired-ink flex items-center justify-center flex-none">
          <TriangleAlert size={17} />
        </span>
        <div>
          <div className="font-bold text-md mb-1">{title}</div>
          <p className="text-sm text-text-secondary leading-relaxed m-0">{message}</p>
        </div>
      </div>
    </div>
  );
}
