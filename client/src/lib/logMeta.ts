import { Lock, Unlock, ShieldAlert, UserCog, type LucideIcon } from "lucide-react";
import type { LogType } from "./types";

export interface LogMeta {
  label: string;
  shortLabel: string;
  badge: "ok" | "warn" | "danger" | "info" | "muted";
  icon: LucideIcon;
}

export const LOG_META: Record<LogType, LogMeta> = {
  DEPOSIT: { label: "Deposited phone", shortLabel: "Deposited", badge: "ok", icon: Lock },
  RETRIEVE: { label: "Retrieved phone", shortLabel: "Retrieved", badge: "info", icon: Unlock },
  INTRUSION: { label: "Intrusion", shortLabel: "Intrusion", badge: "danger", icon: ShieldAlert },
  OVERRIDE: { label: "Teacher override", shortLabel: "Override", badge: "warn", icon: UserCog },
};
