import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, ShieldAlert, History, Lock, Unlock, Clock3, CheckCircle2, Search, DoorOpen, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell, type NavItem } from "../components/AppShell";
import { StatCard } from "../components/StatCard";
import { Badge, Dot } from "../components/Badge";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { SearchInput } from "../components/SearchInput";
import { EmptyState, TableSkeleton } from "../components/EmptyState";
import { api, ApiError } from "../lib/api";
import { getSocket } from "../lib/socket";
import { LOG_META } from "../lib/logMeta";
import type { DepositSession, LogEntry, Schedule, Slot } from "../lib/types";

function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    osc.type = "square";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 450);
  } catch {
    /* audio unavailable */
  }
}

export function TeacherPage() {
  const [tab, setTab] = useState("overview");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [activeSchedule, setActiveSchedule] = useState<Schedule | null>(null);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [detailSlot, setDetailSlot] = useState<Slot | null>(null);
  const [session, setSession] = useState<DepositSession | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const canOverride = !!activeSchedule;

  const loadOverview = useCallback(async () => {
    const data = await api<{ slots: Slot[]; myActiveSchedule: Schedule | null; depositSession: DepositSession }>(
      "GET",
      "/api/teacher/overview"
    );
    setSlots(data.slots);
    setActiveSchedule(data.myActiveSchedule);
    setSession(data.depositSession);
  }, []);

  const loadLogs = useCallback(async () => {
    const data = await api<LogEntry[]>("GET", "/api/teacher/logs");
    setLogs(data);
  }, []);

  useEffect(() => {
    loadOverview();
    loadLogs();
    const interval = setInterval(loadOverview, 20000);

    const socket = getSocket();
    const onSlots = (s: Slot[]) => setSlots(s);
    const onSession = (s: DepositSession) => setSession(s);
    const onLogNew = (entry: LogEntry) => {
      setLogs((prev) => [entry, ...(prev || [])]);
      if (entry.type === "INTRUSION") {
        beep();
        toast.error(`Intrusion — ${entry.slotLabel || "?"}`, {
          description: entry.note || entry.studentName,
        });
      }
    };
    const onLogUpdate = (entry: LogEntry) => {
      setLogs((prev) => (prev || []).map((l) => (l.id === entry.id ? entry : l)));
    };
    socket.on("slots:update", onSlots);
    socket.on("session:update", onSession);
    socket.on("log:new", onLogNew);
    socket.on("log:update", onLogUpdate);

    return () => {
      clearInterval(interval);
      socket.off("slots:update", onSlots);
      socket.off("session:update", onSession);
      socket.off("log:new", onLogNew);
      socket.off("log:update", onLogUpdate);
    };
  }, [loadOverview, loadLogs]);

  const override = async (slotId: string, action: "lock" | "unlock") => {
    try {
      await api("POST", "/api/teacher/override", { slotId, action });
      toast.success(`Locker ${action === "unlock" ? "unlocked" : "locked"}.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const ack = async (id: string) => {
    await api("POST", `/api/teacher/logs/${id}/ack`);
  };

  const toggleSession = async () => {
    setSessionBusy(true);
    try {
      if (session?.open) {
        await api("POST", "/api/teacher/deposit-session/stop");
        toast.success("Cabinet locked — collection ended.");
      } else {
        await api("POST", "/api/teacher/deposit-session/start");
        toast.success("Cabinet unlocked — students can start depositing.");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSessionBusy(false);
    }
  };

  const intrusions = (logs || []).filter((l) => l.type === "INTRUSION");
  const pendingIntrusions = intrusions.filter((l) => !l.acknowledged);
  const occupiedCount = (slots || []).filter((s) => s.occupied).length;

  const navItems: NavItem[] = [
    { key: "overview", label: "Overview", icon: <LayoutGrid size={17} /> },
    { key: "intrusions", label: "Intrusions", icon: <ShieldAlert size={17} />, badge: pendingIntrusions.length },
    { key: "history", label: "History Log", icon: <History size={17} /> },
  ];

  return (
    <AppShell
      navItems={navItems}
      activeKey={tab}
      onNavigate={setTab}
      roleLabel="Teacher"
      title={tab === "overview" ? "Overview" : tab === "intrusions" ? "Intrusions" : "History Log"}
      subtitle={tab === "overview" ? "Locker status and your active class period" : undefined}
    >
      {tab === "overview" && (
        <div className="animate-fadeIn">
          <div
            className={`mb-5 flex items-center gap-3 rounded-md border px-4 py-3.5 text-[13px] ${
              activeSchedule ? "border-ok/35 bg-ok/10 text-emerald-100" : "border-border bg-surface text-muted"
            }`}
          >
            <Clock3 size={16} className="flex-shrink-0" />
            {activeSchedule ? (
              <span>
                <strong>Active period:</strong> {activeSchedule.sectionLabel} ({activeSchedule.startTime}–
                {activeSchedule.endTime}) — you have locker control now.
              </span>
            ) : (
              <span>No active class period right now — locker override is disabled.</span>
            )}
          </div>

          <div className="card mb-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md ${
                    session?.open ? "bg-ok/15 text-ok" : "bg-surface2 text-muted"
                  }`}
                >
                  <DoorOpen size={18} />
                </div>
                <div>
                  <div className="text-[14px] font-bold">
                    Deposit Collection {session?.open ? <Badge variant="ok">Open</Badge> : <Badge variant="muted">Closed</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {session?.open
                      ? "Students may scan to deposit their phones, one at a time."
                      : "Unlock the cabinet to start collecting phones for this period."}
                  </p>
                </div>
              </div>
              <button
                className={session?.open ? "btn-danger" : "btn-primary"}
                disabled={sessionBusy || (!session?.open && !canOverride)}
                onClick={toggleSession}
                title={!canOverride && !session?.open ? "You need an active class period to start collection." : undefined}
              >
                {sessionBusy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
                {session?.open ? <Lock size={14} /> : <Unlock size={14} />}
                {session?.open ? "Lock Cabinet" : "Unlock Cabinet"}
              </button>
            </div>

            {session?.open && session.inProgress && (
              <div className="mt-4 flex items-center gap-3 rounded-md border border-primary/30 bg-primary/10 px-3.5 py-2.5">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-hi opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-hi" />
                </span>
                <UserRound size={14} className="flex-shrink-0 text-primary-hi" />
                <span className="text-[12.5px]">
                  <strong>{session.inProgress.studentName}</strong> is placing their phone in{" "}
                  <strong>{session.inProgress.slotLabel}</strong> — kiosk is holding until this is confirmed.
                </span>
              </div>
            )}
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <StatCard label="Total Lockers" value={slots?.length ?? "—"} icon={<LayoutGrid size={14} />} />
            <StatCard label="Occupied" value={occupiedCount} icon={<Lock size={14} />} tint="warn" />
            <StatCard label="Vacant" value={(slots?.length ?? 0) - occupiedCount} icon={<Unlock size={14} />} tint="ok" />
            <StatCard label="Pending Alerts" value={pendingIntrusions.length} icon={<ShieldAlert size={14} />} tint="danger" />
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[14.5px] font-bold">Locker Status</h2>
              <span className="text-xs text-faint">Click a locker for details</span>
            </div>
            {!slots ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-md bg-surface2" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {slots.map((s) => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailSlot(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailSlot(s);
                      }
                    }}
                    className={`cursor-pointer rounded-md border p-3.5 text-center transition-all hover:-translate-y-0.5 hover:shadow-soft ${
                      s.occupied ? "border-warn/40" : "border-ok/30"
                    } bg-surface`}
                  >
                    <div className="flex items-center justify-center gap-1.5 text-[13px] font-bold">
                      <Dot variant={s.occupied ? "warn" : "ok"} />
                      {s.label}
                    </div>
                    <div className="mt-1.5 flex min-h-[24px] items-center justify-center gap-1.5 text-[11px] text-muted">
                      {s.occupied && s.occupantName && <Avatar name={s.occupantName} size={18} />}
                      {s.occupantName || (s.occupied ? "Occupied" : "Vacant")}
                    </div>
                    <div className="mt-2.5 flex justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-secondary btn-sm"
                        disabled={!canOverride}
                        onClick={() => override(s.id, "unlock")}
                      >
                        <Unlock size={12} />
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        disabled={!canOverride}
                        onClick={() => override(s.id, "lock")}
                      >
                        <Lock size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "intrusions" && (
        <div className="card !p-0 animate-fadeIn">
          <div className="table-wrap overflow-x-auto rounded-lg">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-surface2 text-left text-[10.5px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-3.5 py-3">Student</th>
                  <th className="px-3.5 py-3">Locker</th>
                  <th className="px-3.5 py-3">Detail</th>
                  <th className="px-3.5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {!logs && <TableSkeleton rows={3} cols={5} />}
                {logs && intrusions.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState icon={<ShieldAlert size={28} />} title="No intrusions logged" />
                    </td>
                  </tr>
                )}
                {intrusions.map((l) => (
                  <tr key={l.id} className="border-t border-borderSoft hover:bg-surface2">
                    <td className="px-4 py-3">{new Date(l.timestamp).toLocaleString("en-PH")}</td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={l.studentName} size={24} />
                        {l.studentName}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">{l.slotLabel || "-"}</td>
                    <td className="px-3.5 py-3 text-muted">{l.note || "—"}</td>
                    <td className="px-3.5 py-3 text-right">
                      {l.acknowledged ? (
                        <Badge variant="muted">
                          <CheckCircle2 size={11} /> Acknowledged
                        </Badge>
                      ) : (
                        <button className="btn-secondary btn-sm" onClick={() => ack(l.id)}>
                          Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "history" && <HistoryLog logs={logs} />}

      <LockerDetailModal slot={detailSlot} onClose={() => setDetailSlot(null)} logs={logs} canOverride={canOverride} onOverride={override} />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// History log (search + type filter)
// ---------------------------------------------------------------------------
function HistoryLog({ logs }: { logs: LogEntry[] | null }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | LogEntry["type"]>("ALL");

  const filtered = useMemo(() => {
    return (logs || []).filter((l) => {
      if (typeFilter !== "ALL" && l.type !== typeFilter) return false;
      if (search && !`${l.studentName} ${l.slotLabel || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, typeFilter, search]);

  return (
    <div className="animate-fadeIn">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search student or locker…" />
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-elevated p-0.5">
          {(["ALL", "DEPOSIT", "RETRIEVE", "INTRUSION", "OVERRIDE"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-[6px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                typeFilter === t ? "bg-primary/20 text-primary-hi" : "text-muted hover:text-text"
              }`}
            >
              {t === "ALL" ? "All" : LOG_META[t].shortLabel}
            </button>
          ))}
        </div>
      </div>

      <div className="card !p-0">
        <div className="table-wrap overflow-x-auto rounded-lg">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface2 text-left text-[10.5px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Time</th>
                <th className="px-3.5 py-3">Event</th>
                <th className="px-3.5 py-3">Student</th>
                <th className="px-3.5 py-3">Locker</th>
              </tr>
            </thead>
            <tbody>
              {!logs && <TableSkeleton rows={6} cols={4} />}
              {logs && filtered.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState icon={<Search size={28} />} title="No matching activity" />
                  </td>
                </tr>
              )}
              {filtered.slice(0, 80).map((l) => {
                const meta = LOG_META[l.type];
                const Icon = meta.icon;
                return (
                  <tr key={l.id} className="border-t border-borderSoft hover:bg-surface2">
                    <td className="px-4 py-3 text-muted">{new Date(l.timestamp).toLocaleString("en-PH")}</td>
                    <td className="px-3.5 py-3">
                      <Badge variant={meta.badge}>
                        <Icon size={11} /> {meta.label}
                      </Badge>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={l.studentName} size={22} />
                        {l.studentName}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-muted">{l.slotLabel || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locker detail modal
// ---------------------------------------------------------------------------
function LockerDetailModal({
  slot,
  onClose,
  logs,
  canOverride,
  onOverride,
}: {
  slot: Slot | null;
  onClose: () => void;
  logs: LogEntry[] | null;
  canOverride: boolean;
  onOverride: (slotId: string, action: "lock" | "unlock") => void;
}) {
  const history = (logs || []).filter((l) => l.slotId === slot?.id).slice(0, 10);

  return (
    <Modal open={!!slot} onClose={onClose} title={slot?.label || ""} subtitle={slot?.occupied ? "Currently occupied" : "Currently vacant"} width="420px">
      {slot && (
        <>
          <div className="mb-4 flex items-center justify-between rounded-md bg-elevated px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              {slot.occupantName ? <Avatar name={slot.occupantName} size={30} /> : <div className="h-[30px] w-[30px]" />}
              <div>
                <div className="text-[13px] font-semibold">{slot.occupantName || "No one"}</div>
                <div className="text-xs text-muted">{slot.occupied ? "Phone deposited" : "Locker empty"}</div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button className="btn-secondary btn-sm" disabled={!canOverride} onClick={() => onOverride(slot.id, "unlock")}>
                <Unlock size={12} /> Unlock
              </button>
              <button className="btn-secondary btn-sm" disabled={!canOverride} onClick={() => onOverride(slot.id, "lock")}>
                <Lock size={12} /> Lock
              </button>
            </div>
          </div>

          <h4 className="mb-2 text-xs font-semibold text-muted">Recent history</h4>
          {history.length === 0 ? (
            <p className="py-4 text-center text-xs text-faint">No activity recorded for this locker yet.</p>
          ) : (
            <div className="flex max-h-[280px] flex-col gap-1.5 overflow-y-auto">
              {history.map((l) => {
                const meta = LOG_META[l.type];
                const Icon = meta.icon;
                return (
                  <div key={l.id} className="flex items-center justify-between rounded-md px-2.5 py-2 text-[12.5px] hover:bg-surface2">
                    <div className="flex items-center gap-2">
                      <Icon size={13} className="text-muted" />
                      <span>{l.studentName}</span>
                    </div>
                    <span className="text-xs text-faint">{new Date(l.timestamp).toLocaleString("en-PH", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
