import type { ReactNode } from "react";

type Variant = "ok" | "warn" | "danger" | "info" | "muted";

const classes: Record<Variant, string> = {
  ok: "badge-ok",
  warn: "badge-warn",
  danger: "badge-danger",
  info: "badge-info",
  muted: "badge-muted",
};

export function Badge({ variant, children }: { variant: Variant; children: ReactNode }) {
  return <span className={classes[variant]}>{children}</span>;
}

export function Dot({ variant }: { variant: "ok" | "warn" | "danger" | "muted" }) {
  const dotColor = {
    ok: "bg-ok shadow-[0_0_8px_theme(colors.ok)]",
    warn: "bg-warn shadow-[0_0_8px_theme(colors.warn)]",
    danger: "bg-danger shadow-[0_0_8px_theme(colors.danger)]",
    muted: "bg-faint",
  }[variant];
  return <span className={`inline-block h-[7px] w-[7px] rounded-full ${dotColor}`} />;
}
