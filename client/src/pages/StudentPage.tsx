import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Smartphone, History, Radio } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { Badge } from "../components/Badge";
import { EmptyState } from "../components/EmptyState";
import { LOG_META } from "../lib/logMeta";

interface StudentMe {
  name: string;
  qrImage: string;
  slotLabel: string | null;
  scheduleLabel: string;
  accessActive: boolean;
  phoneDeposited: boolean;
  logs: { id: string; type: keyof typeof LOG_META; timestamp: string; slotLabel: string | null }[];
}

export function StudentPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<StudentMe | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = () => api<StudentMe>("GET", "/api/student/me").then((d) => mounted && setData(d));
    load();
    const poll = setInterval(load, 20000);

    const socket = getSocket();
    const onLogNew = (entry: { studentId: string | null }) => {
      if (entry.studentId === user?.id) load();
    };
    socket.on("log:new", onLogNew);

    return () => {
      mounted = false;
      clearInterval(poll);
      socket.off("log:new", onLogNew);
    };
  }, [user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="bg-mesh min-h-screen">
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
          </span>
          Hi, {user?.name.split(",")[0]}
        </div>
        <button className="btn-ghost btn-sm" onClick={handleLogout}>
          <LogOut size={14} />
          Log Out
        </button>
      </div>

      <div className="mx-auto max-w-md px-5 pb-16">
        <div className="relative overflow-hidden rounded-lg border border-border bg-gradient-to-b from-surface to-surface2 p-7 text-center shadow-lg2">
          <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
          <p className="text-xs text-muted">Show this to the scanner at your locker station</p>

          <div className="mx-auto mt-4 inline-block rounded-md bg-white p-4 shadow-soft">
            {data ? (
              <img src={data.qrImage} alt="Your personal QR code" className="h-[220px] w-[220px]" />
            ) : (
              <div className="h-[220px] w-[220px] animate-pulse rounded bg-gray-200" />
            )}
          </div>

          <h2 className="mt-4 text-[19px] font-bold">{data?.name || user?.name}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {data?.slotLabel ? `Assigned locker: ${data.slotLabel}` : "No locker assigned yet — see the admin."}
          </p>
          <p className="text-[12.5px] text-muted">Schedule: {data?.scheduleLabel ?? "…"}</p>

          <div className="mt-4">
            {!data ? null : !data.accessActive ? (
              <Badge variant="muted">Locker access closed right now</Badge>
            ) : data.phoneDeposited ? (
              <Badge variant="ok">Your phone is deposited</Badge>
            ) : (
              <Badge variant="warn">Your phone is not deposited</Badge>
            )}
          </div>
        </div>

        <div className="card mt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={15} className="text-muted" />
              <h2 className="text-[14.5px] font-bold">My Recent Activity</h2>
            </div>
            <span className="flex items-center gap-1 text-[10.5px] text-faint">
              <Radio size={11} /> Live
            </span>
          </div>
          {data && data.logs.length === 0 && (
            <EmptyState icon={<Smartphone size={28} />} title="No activity yet" sub="Your scans will show up here." />
          )}
          <div className="flex flex-col gap-2">
            {data?.logs.map((l) => {
              const meta = LOG_META[l.type];
              const Icon = meta.icon;
              return (
                <div key={l.id} className="flex items-center justify-between rounded-md border border-borderSoft bg-elevated px-3.5 py-2.5 text-[13px]">
                  <div className="flex items-center gap-2.5">
                    <Icon size={14} className="text-muted" />
                    <span>{meta.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{l.slotLabel || "-"}</span>
                    <span>
                      {new Date(l.timestamp).toLocaleString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
