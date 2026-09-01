import { TriangleAlert } from "lucide-react";

/** Shared "this screen cannot read its data" panel. */
export function SetupNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-6">
      <div className="max-w-[560px] bg-surface border border-line rounded-xl p-5 flex items-start gap-3">
        <span className="w-8 h-8 rounded-lg bg-[#fdf3f1] text-[#8a3324] flex items-center justify-center flex-none">
          <TriangleAlert size={17} />
        </span>
        <div>
          <div className="font-bold text-[15px] mb-1">{title}</div>
          <p className="text-[13.5px] text-text-secondary leading-relaxed m-0">{message}</p>
        </div>
      </div>
    </div>
  );
}
