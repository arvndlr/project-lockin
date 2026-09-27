import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  icon,
  tint = "primary",
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tint?: "primary" | "ok" | "warn" | "danger" | "info";
}) {
  const tintClasses: Record<string, string> = {
    primary: "bg-primary/15 text-primary-hi",
    ok: "bg-ok/15 text-ok",
    warn: "bg-warn/15 text-warn",
    danger: "bg-danger/15 text-danger",
    info: "bg-info/15 text-info",
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${tintClasses[tint]}`}>{icon}</div>
      </div>
      <div className="text-[26px] font-extrabold tracking-tight">{value}</div>
    </div>
  );
}
