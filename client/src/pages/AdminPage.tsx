import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  Boxes,
  CalendarClock,
  LayoutGrid,
  Plus,
  Trash2,
  Pencil,
  Lock,
  Unlock,
  GraduationCap,
  UserCog,
  ShieldAlert,
  Clock3,
  QrCode,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, type NavItem } from "../components/AppShell";
import { EmptyState } from "../components/EmptyState";
import { Badge } from "../components/Badge";
import { StatCard } from "../components/StatCard";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { DropdownMenu } from "../components/DropdownMenu";
import { SearchInput } from "../components/SearchInput";
import { useConfirm } from "../context/ConfirmContext";
import { api, ApiError } from "../lib/api";
import { LOG_META } from "../lib/logMeta";
import type { LogEntry, Schedule, Slot, User } from "../lib/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_DAYS = [1, 2, 3, 4, 5];
type ConfirmFn = ReturnType<typeof useConfirm>;

export function AdminPage() {
  const [tab, setTab] = useState("overview");
  const [users, setUsers] = useState<User[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const confirm = useConfirm();

  const loadAll = useCallback(async () => {
    const [u, s, sc, lg] = await Promise.all([
      api<User[]>("GET", "/api/admin/users"),
      api<Slot[]>("GET", "/api/admin/slots"),
      api<Schedule[]>("GET", "/api/admin/schedules"),
      api<LogEntry[]>("GET", "/api/teacher/logs"),
    ]);
    setUsers(u);
    setSlots(s);
    setSchedules(sc);
    setLogs(lg);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const teachers = users.filter((u) => u.role === "TEACHER");
  const students = users.filter((u) => u.role === "STUDENT");
  const pendingIntrusions = (logs || []).filter((l) => l.type === "INTRUSION" && !l.acknowledged);

  const navItems: NavItem[] = [
    { key: "overview", label: "Overview", icon: <LayoutGrid size={17} /> },
    { key: "users", label: "Users", icon: <Users size={17} /> },
    { key: "slots", label: "Lockers", icon: <Boxes size={17} /> },
    { key: "schedules", label: "Schedules", icon: <CalendarClock size={17} /> },
  ];

  const titles: Record<string, string> = {
    overview: "Overview",
    users: "Users",
    slots: "Lockers",
    schedules: "Schedules",
  };

  return (
    <AppShell navItems={navItems} activeKey={tab} onNavigate={setTab} roleLabel="Admin" title={titles[tab]}>
      {tab === "overview" && (
        <OverviewTab
          students={students}
          teachers={teachers}
          slots={slots}
          schedules={schedules}
          logs={logs}
          pendingIntrusions={pendingIntrusions.length}
          goTo={setTab}
        />
      )}
      {tab === "users" && <UsersTab users={users} slots={slots} schedules={schedules} reload={loadAll} confirm={confirm} />}
      {tab === "slots" && <SlotsTab slots={slots} reload={loadAll} confirm={confirm} />}
      {tab === "schedules" && <SchedulesTab schedules={schedules} teachers={teachers} reload={loadAll} confirm={confirm} />}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewTab({
  students,
  teachers,
  slots,
  schedules,
  logs,
  pendingIntrusions,
  goTo,
}: {
  students: User[];
  teachers: User[];
  slots: Slot[];
  schedules: Schedule[];
  logs: LogEntry[] | null;
  pendingIntrusions: number;
  goTo: (key: string) => void;
}) {
  const occupied = slots.filter((s) => s.occupied).length;
  const activeSchedules = schedules.filter((s) => s.activeNow).length;

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="Students" value={students.length} icon={<GraduationCap size={14} />} />
        <StatCard label="Teachers" value={teachers.length} icon={<UserCog size={14} />} tint="info" />
        <StatCard
          label="Lockers Occupied"
          value={`${occupied}/${slots.length}`}
          icon={<Lock size={14} />}
          tint={occupied ? "warn" : "ok"}
        />
        <StatCard
          label="Schedules Active Now"
          value={activeSchedules}
          icon={<Clock3 size={14} />}
          tint={activeSchedules ? "ok" : "primary"}
        />
      </div>

      {pendingIntrusions > 0 && (
        <button
          onClick={() => goTo("slots")}
          className="mb-5 flex w-full items-center gap-3 rounded-md border border-danger/40 bg-danger/10 px-4 py-3.5 text-left text-[13px] text-rose-100 transition-colors hover:bg-danger/15"
        >
          <ShieldAlert size={16} className="flex-shrink-0 text-danger" />
          <span>
            <strong>{pendingIntrusions}</strong> unacknowledged intrusion{pendingIntrusions === 1 ? "" : "s"} — reviewable
            from the teacher dashboard.
          </span>
        </button>
      )}

      <div className="grid gap-4.5 lg:grid-cols-[1fr_360px]">
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <History size={15} className="text-muted" />
            <h2 className="text-[14.5px] font-bold">Recent Activity</h2>
          </div>
          {!logs && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-md bg-surface2" />
              ))}
            </div>
          )}
          {logs && logs.length === 0 && <EmptyState icon={<History size={28} />} title="No activity yet" />}
          <div className="flex flex-col gap-1.5">
            {logs?.slice(0, 8).map((l) => {
              const meta = LOG_META[l.type];
              const Icon = meta.icon;
              return (
                <div key={l.id} className="flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] hover:bg-surface2">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={l.studentName} size={22} />
                    <span className="font-medium">{l.studentName}</span>
                    <Badge variant={meta.badge}>
                      <Icon size={11} /> {meta.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-faint">
                    <span>{l.slotLabel || "-"}</span>
                    <span>{new Date(l.timestamp).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card h-fit">
          <h2 className="mb-4 text-[14.5px] font-bold">Quick Actions</h2>
          <div className="flex flex-col gap-2">
            <button onClick={() => goTo("users")} className="btn-secondary justify-start">
              <Plus size={14} /> Add a user
            </button>
            <button onClick={() => goTo("slots")} className="btn-secondary justify-start">
              <QrCode size={14} /> Create a locker + QR
            </button>
            <button onClick={() => goTo("schedules")} className="btn-secondary justify-start">
              <CalendarClock size={14} /> Set up a schedule
            </button>
          </div>

          <h3 className="mb-2 mt-6 text-xs font-semibold text-muted">Active right now</h3>
          {schedules.filter((s) => s.activeNow).length === 0 ? (
            <p className="text-xs text-faint">No schedule is currently in session.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {schedules
                .filter((s) => s.activeNow)
                .map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md bg-elevated px-3 py-2 text-xs">
                    <span className="font-medium">{s.sectionLabel}</span>
                    <Badge variant="ok">
                      {s.startTime}–{s.endTime}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users tab
// ---------------------------------------------------------------------------
function UsersTab({
  users,
  slots,
  schedules,
  reload,
  confirm,
}: {
  users: User[];
  slots: Slot[];
  schedules: Schedule[];
  reload: () => Promise<void>;
  confirm: ConfirmFn;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "STUDENT" | "TEACHER">("ALL");

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (search && !`${u.name} ${u.username}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [users, roleFilter, search]);

  const updateStudent = async (id: string, field: "slotId" | "scheduleId", value: string) => {
    try {
      await api("PATCH", `/api/admin/users/${id}`, { [field]: value || null });
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed.");
    }
  };

  const deleteUser = async (u: User) => {
    const ok = await confirm({
      title: `Delete ${u.name}?`,
      description: "This removes their account permanently. Activity history stays on record.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("DELETE", `/api/admin/users/${u.id}`);
      toast.success("User deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name or username…" />
          <div className="flex rounded-md border border-border bg-elevated p-0.5">
            {(["ALL", "STUDENT", "TEACHER"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`rounded-[6px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  roleFilter === r ? "bg-primary/20 text-primary-hi" : "text-muted hover:text-text"
                }`}
              >
                {r === "ALL" ? "All" : r === "STUDENT" ? "Students" : "Teachers"}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Add User
        </button>
      </div>

      <div className="card !p-0">
        <div className="table-wrap overflow-x-auto rounded-lg">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface2 text-left text-[10.5px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Name</th>
                <th className="px-3.5 py-3">Role</th>
                <th className="px-3.5 py-3">Locker</th>
                <th className="px-3.5 py-3">Schedule</th>
                <th className="px-3.5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState icon={<Users size={28} />} title="No matching users" />
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-borderSoft hover:bg-surface2">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.name} size={30} />
                      <div>
                        <div className="font-medium leading-tight">{u.name}</div>
                        <div className="text-xs leading-tight text-faint">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <Badge variant={u.role === "ADMIN" ? "info" : u.role === "TEACHER" ? "warn" : "muted"}>{u.role}</Badge>
                  </td>
                  <td className="px-3.5 py-2.5">
                    {u.role === "STUDENT" ? (
                      <select
                        className="input min-w-[150px] !py-1.5 !text-xs"
                        value={u.slotId || ""}
                        onChange={(e) => updateStudent(u.id, "slotId", e.target.value)}
                      >
                        <option value="">— none —</option>
                        {slots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    {u.role === "STUDENT" ? (
                      <select
                        className="input min-w-[160px] !py-1.5 !text-xs"
                        value={u.scheduleId || ""}
                        onChange={(e) => updateStudent(u.id, "scheduleId", e.target.value)}
                      >
                        <option value="">Always available</option>
                        {schedules.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.sectionLabel}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    <DropdownMenu
                      actions={[{ label: "Delete user", icon: <Trash2 size={13} />, danger: true, onClick: () => deleteUser(u) }]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddUserModal open={modalOpen} onClose={() => setModalOpen(false)} slots={slots} schedules={schedules} reload={reload} />
    </div>
  );
}

function AddUserModal({
  open,
  onClose,
  slots,
  schedules,
  reload,
}: {
  open: boolean;
  onClose: () => void;
  slots: Slot[];
  schedules: Schedule[];
  reload: () => Promise<void>;
}) {
  const [role, setRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [slotId, setSlotId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setRole("STUDENT");
    setName("");
    setUsername("");
    setPassword("");
    setSlotId("");
    setScheduleId("");
    setError("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("POST", "/api/admin/users", {
        role,
        name,
        username,
        password,
        slotId: slotId || null,
        scheduleId: scheduleId || null,
      });
      toast.success(`${role === "STUDENT" ? "Student" : "Teacher"} account created.`);
      reset();
      onClose();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add User" subtitle="Create a student or teacher account." width="440px">
      <form onSubmit={submit}>
        <div className="mb-3.5">
          <label className="field-label">Role</label>
          <div className="flex rounded-md border border-border bg-elevated p-0.5">
            {(["STUDENT", "TEACHER"] as const).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setRole(r)}
                className={`flex-1 rounded-[6px] py-1.5 text-xs font-semibold transition-colors ${
                  role === r ? "bg-primary/20 text-primary-hi" : "text-muted hover:text-text"
                }`}
              >
                {r === "STUDENT" ? "Student" : "Teacher"}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-3.5">
          <label className="field-label">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="mb-3.5 flex gap-2.5">
          <div className="flex-1">
            <label className="field-label">Username</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="flex-1">
            <label className="field-label">Password</label>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        </div>
        {role === "STUDENT" && (
          <div className="mb-1 flex gap-2.5">
            <div className="flex-1">
              <label className="field-label">Assigned locker</label>
              <select className="input" value={slotId} onChange={(e) => setSlotId(e.target.value)}>
                <option value="">Auto-assign next available</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.occupied ? " (occupied)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="field-label">Schedule</label>
              <select className="input" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
                <option value="">Always available</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sectionLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="min-h-[18px] py-2 text-[12.5px] text-danger">{error}</div>
        <div className="mt-2 flex justify-end gap-2.5">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
            <Plus size={15} /> Create Account
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Slots tab
// ---------------------------------------------------------------------------
function SlotsTab({ slots, reload, confirm }: { slots: Slot[]; reload: () => Promise<void>; confirm: ConfirmFn }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [qrPreview, setQrPreview] = useState<Slot | null>(null);

  const filtered = slots.filter((s) => s.label.toLowerCase().includes(search.toLowerCase()));

  const deleteSlot = async (s: Slot) => {
    const ok = await confirm({ title: `Delete ${s.label}?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api("DELETE", `/api/admin/slots/${s.id}`);
      toast.success("Locker deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search lockers…" />
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Add Locker
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Boxes size={28} />} title="No lockers found" sub="Create one to generate its QR code." />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.map((s) => (
            <div
              key={s.id}
              className={`group relative rounded-lg border p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-soft ${
                s.occupied ? "border-warn/40 bg-surface" : "border-ok/25 bg-surface"
              }`}
            >
              <div className="absolute right-2 top-2">
                <DropdownMenu
                  actions={[{ label: "Delete locker", icon: <Trash2 size={13} />, danger: true, onClick: () => deleteSlot(s) }]}
                />
              </div>
              <button onClick={() => setQrPreview(s)} className="mx-auto mb-2 block rounded-md bg-white p-1.5 transition-transform hover:scale-105">
                {s.qrImage && <img src={s.qrImage} alt={`QR for ${s.label}`} className="h-[68px] w-[68px]" />}
              </button>
              <div className="text-[13px] font-bold">{s.label}</div>
              <div className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-muted">
                {s.occupied ? <Lock size={10} className="text-warn" /> : <Unlock size={10} className="text-ok" />}
                {s.occupied ? s.occupantName || "Occupied" : "Vacant"}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddSlotModal open={modalOpen} onClose={() => setModalOpen(false)} reload={reload} />
      <QrPreviewModal slot={qrPreview} onClose={() => setQrPreview(null)} />
    </div>
  );
}

function AddSlotModal({ open, onClose, reload }: { open: boolean; onClose: () => void; reload: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("POST", "/api/admin/slots", { label });
      toast.success("Locker created.");
      setLabel("");
      onClose();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Locker" subtitle="A unique QR code is generated automatically." width="380px">
      <form onSubmit={submit}>
        <div className="mb-1">
          <label className="field-label">Label</label>
          <input className="input" placeholder="e.g. Locker 07" value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus />
        </div>
        <div className="min-h-[18px] py-2 text-[12.5px] text-danger">{error}</div>
        <div className="mt-2 flex justify-end gap-2.5">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
            <Plus size={15} /> Create Locker
          </button>
        </div>
      </form>
    </Modal>
  );
}

function QrPreviewModal({ slot, onClose }: { slot: Slot | null; onClose: () => void }) {
  return (
    <Modal open={!!slot} onClose={onClose} title={slot?.label || ""} subtitle="Print this and mount it on the physical locker." width="320px">
      {slot?.qrImage && (
        <div className="text-center">
          <div className="mx-auto inline-block rounded-lg bg-white p-4">
            <img src={slot.qrImage} alt={`QR for ${slot.label}`} className="h-[220px] w-[220px]" />
          </div>
          <p className="mt-4 text-xs text-faint">Token: {slot.qrToken}</p>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Schedules tab
// ---------------------------------------------------------------------------
function SchedulesTab({
  schedules,
  teachers,
  reload,
  confirm,
}: {
  schedules: Schedule[];
  teachers: User[];
  reload: () => Promise<void>;
  confirm: ConfirmFn;
}) {
  const [modalState, setModalState] = useState<{ open: boolean; editing: Schedule | null }>({ open: false, editing: null });
  const [search, setSearch] = useState("");

  const filtered = schedules.filter(
    (s) => s.sectionLabel.toLowerCase().includes(search.toLowerCase()) || (s.teacherName || "").toLowerCase().includes(search.toLowerCase())
  );

  const deleteSchedule = async (s: Schedule) => {
    const ok = await confirm({ title: `Delete "${s.sectionLabel}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api("DELETE", `/api/admin/schedules/${s.id}`);
      toast.success("Schedule deleted.");
      await reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by section or teacher…" />
        <button className="btn-primary" onClick={() => setModalState({ open: true, editing: null })} disabled={!teachers.length}>
          <Plus size={15} /> Add Schedule
        </button>
      </div>

      {!teachers.length && (
        <div className="mb-4 rounded-md border border-warn/30 bg-warn/10 px-4 py-3 text-[12.5px] text-amber-100">
          Add a teacher account first — schedules need one to attach to.
        </div>
      )}

      <div className="card !p-0">
        <div className="table-wrap overflow-x-auto rounded-lg">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-surface2 text-left text-[10.5px] uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Section</th>
                <th className="px-3.5 py-3">Teacher</th>
                <th className="px-3.5 py-3">Days</th>
                <th className="px-3.5 py-3">Time</th>
                <th className="px-3.5 py-3">Now</th>
                <th className="px-3.5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={<CalendarClock size={28} />} title="No schedules found" />
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-borderSoft hover:bg-surface2">
                  <td className="px-4 py-2.5 font-medium">{s.sectionLabel}</td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={s.teacherName || "?"} size={22} />
                      {s.teacherName}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-muted">{s.days.map((d) => DAY_NAMES[d]).join(", ")}</td>
                  <td className="px-3.5 py-2.5 text-muted">
                    {s.startTime}–{s.endTime}
                  </td>
                  <td className="px-3.5 py-2.5">{s.activeNow ? <Badge variant="ok">Active</Badge> : <Badge variant="muted">—</Badge>}</td>
                  <td className="px-3.5 py-2.5 text-right">
                    <DropdownMenu
                      actions={[
                        { label: "Edit schedule", icon: <Pencil size={13} />, onClick: () => setModalState({ open: true, editing: s }) },
                        { label: "Delete schedule", icon: <Trash2 size={13} />, danger: true, onClick: () => deleteSchedule(s) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ScheduleModal
        open={modalState.open}
        editing={modalState.editing}
        onClose={() => setModalState({ open: false, editing: null })}
        teachers={teachers}
        reload={reload}
      />
    </div>
  );
}

function ScheduleModal({
  open,
  editing,
  onClose,
  teachers,
  reload,
}: {
  open: boolean;
  editing: Schedule | null;
  onClose: () => void;
  teachers: User[];
  reload: () => Promise<void>;
}) {
  const [teacherId, setTeacherId] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [days, setDays] = useState<number[]>(DEFAULT_DAYS);
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("12:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTeacherId(editing.teacherId);
      setSectionLabel(editing.sectionLabel);
      setDays(editing.days);
      setStartTime(editing.startTime);
      setEndTime(editing.endTime);
    } else {
      setTeacherId(teachers[0]?.id || "");
      setSectionLabel("");
      setDays(DEFAULT_DAYS);
      setStartTime("07:00");
      setEndTime("12:00");
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = { teacherId, sectionLabel, days, startTime, endTime };
    try {
      if (editing) {
        await api("PATCH", `/api/admin/schedules/${editing.id}`, payload);
        toast.success("Schedule updated.");
      } else {
        await api("POST", "/api/admin/schedules", payload);
        toast.success("Schedule created.");
      }
      onClose();
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Schedule" : "Add Schedule"} width="420px">
      <form onSubmit={submit}>
        <div className="mb-3.5">
          <label className="field-label">Teacher</label>
          <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3.5">
          <label className="field-label">Section label</label>
          <input
            className="input"
            placeholder="e.g. STEM 11 - Corinthians"
            value={sectionLabel}
            onChange={(e) => setSectionLabel(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="mb-3.5">
          <label className="field-label">Days</label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, i) => (
              <button
                type="button"
                key={i}
                onClick={() => toggleDay(i)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  days.includes(i) ? "border-primary bg-primary/15 text-primary-hi" : "border-border bg-elevated text-muted"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-1 flex gap-2.5">
          <div className="flex-1">
            <label className="field-label">Start time</label>
            <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
          <div className="flex-1">
            <label className="field-label">End time</label>
            <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </div>
        </div>
        <div className="min-h-[18px] py-2 text-[12.5px] text-danger">{error}</div>
        <div className="mt-2 flex justify-end gap-2.5">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !teacherId}>
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
            {editing ? <Pencil size={14} /> : <Plus size={15} />}
            {editing ? "Save Changes" : "Create Schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
