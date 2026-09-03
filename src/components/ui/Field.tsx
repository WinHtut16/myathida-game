import type { InputHTMLAttributes } from "react";
import { Label } from "./Label";
import { Input } from "./Input";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/**
 * Label + Input + error, in one place. Consolidates the three
 * near-identical local versions this app had (ProductsView.tsx,
 * RecordSessionModal.tsx, and raw spans in AccountView/ExportPanel/
 * SessionTable) into a single shared component. See DESIGN.md's Forms
 * section — helper/error never both show at once.
 */
export function Field({ label, error, id, className, ...props }: FieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} error={!!error} className={className} {...props} />
      {error && <p className="mt-1 text-[11px] text-status-expired">{error}</p>}
    </div>
  );
}
