import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Lock, ScanLine, CheckCircle2, XCircle, ShieldAlert, LogIn, CameraOff, DoorOpen, RotateCcw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { DepositSession } from "../lib/types";

interface Student {
  id: string;
  name: string;
  qrToken: string;
}
interface ScanOk {
  ok: true;
  student: Student;
  slot: { id: string; label: string };
  action: "deposit" | "retrieve";
}
interface ScanFail {
  ok: false;
  reason: string;
}

function beep(freq = 880, duration = 200) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch {
    /* audio unavailable */
  }
}
function alarmBeep() {
  beep(440, 250);
  setTimeout(() => beep(440, 250), 300);
  setTimeout(() => beep(440, 250), 600);
}

function initials(name: string) {
  const letters = name.match(/[A-Z]/g) || [];
  return (letters[0] || "?") + (letters[1] || "");
}

export function KioskPage() {
  const [phase, setPhase] = useState<"scan" | "confirm">("scan");
  const [pending, setPending] = useState<ScanOk | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; title: string; message: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedToken, setSelectedToken] = useState("");
  const [session, setSession] = useState<DepositSession | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pausedRef = useRef(false);
  const processingRef = useRef(false);

  useEffect(() => {
    api<Student[]>("GET", "/api/kiosk/students").then(setStudents).catch(() => {});
  }, []);

  useEffect(() => {
    const load = () => api<DepositSession>("GET", "/api/kiosk/session").then(setSession).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    let cancelled = false;
    let started = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decodedText) => {
          if (!pausedRef.current) handleToken(decodedText.trim());
        },
        () => {}
      )
      .then(() => {
        started = true;
        // The component unmounted (e.g. React StrictMode's double-effect in
        // dev) while the camera was still starting up — tear it down now
        // that it's actually safe to call stop().
        if (cancelled) {
          scanner.stop().catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setCameraError(String(err?.message || err));
      });

    return () => {
      cancelled = true;
      // html5-qrcode throws (not just rejects) if stop() is called before
      // start() has resolved, so only call it once we know the camera is
      // actually running.
      if (started) {
        scanner.stop().catch(() => {});
      }
      try {
        scanner.clear();
      } catch {
        /* no-op */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pauseScanner = () => {
    if (scannerRef.current && !pausedRef.current) {
      try {
        scannerRef.current.pause(true);
      } catch {
        /* not started */
      }
      pausedRef.current = true;
    }
  };
  const resumeScanner = () => {
    if (scannerRef.current && pausedRef.current) {
      try {
        scannerRef.current.resume();
      } catch {
        /* not running */
      }
      pausedRef.current = false;
    }
  };

  const backToScan = () => {
    setPhase("scan");
    setPending(null);
    setFlash(null);
    setRetryCount(0);
    resumeScanner();
  };

  const handleToken = async (qrToken: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    pauseScanner();
    try {
      const result = await api<ScanOk | ScanFail>("POST", "/api/kiosk/scan", { qrToken });
      if (!result.ok) {
        const isIntrusion = result.reason.toLowerCase().includes("conflict");
        if (isIntrusion) alarmBeep();
        setFlash({ ok: false, title: isIntrusion ? "Intrusion detected" : "Can't proceed", message: result.reason });
        setTimeout(() => {
          processingRef.current = false;
          backToScan();
        }, isIntrusion ? 4000 : 2500);
        return;
      }
      setRetryCount(0);
      setPending(result);
      setPhase("confirm");
      processingRef.current = false;
    } catch (err) {
      setFlash({ ok: false, title: "Error", message: err instanceof ApiError ? err.message : "Something went wrong." });
      setTimeout(() => {
        processingRef.current = false;
        backToScan();
      }, 2500);
    }
  };

  const confirm = async (correct: boolean) => {
    if (!pending) return;
    const { student, action } = pending;
    try {
      await api("POST", "/api/kiosk/confirm", { qrToken: student.qrToken, action, correct });
      if (correct) {
        setFlash({
          ok: true,
          title: action === "deposit" ? "Phone deposited" : "Phone retrieved",
          message: `${student.name} — ${pending.slot.label}`,
        });
        setTimeout(backToScan, 2200);
      } else if (action === "deposit") {
        // Wrong slot during a deposit: the kiosk stays locked to this same
        // student (server keeps the queue claim) so nobody else can scan —
        // clear the flash and re-show the same confirm screen to retry.
        alarmBeep();
        setRetryCount((c) => c + 1);
        setFlash({
          ok: false,
          title: "Wrong slot!",
          message: `Please place your phone in ${pending.slot.label} and confirm again. Your teacher has been notified.`,
        });
        setTimeout(() => setFlash(null), 3500);
      } else {
        alarmBeep();
        setFlash({ ok: false, title: "Intrusion reported", message: "Your teacher has been notified." });
        setTimeout(backToScan, 3500);
      }
    } catch (err) {
      setFlash({ ok: false, title: "Error", message: err instanceof ApiError ? err.message : "Something went wrong." });
      setTimeout(backToScan, 2500);
    }
  };

  const simulateScan = () => {
    if (selectedToken) handleToken(selectedToken);
  };

  return (
    <div className="bg-mesh flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-primary to-violet shadow-glow">
            <Lock size={17} className="text-white" />
          </div>
          <div>
            <div className="text-[14px] font-bold">Project LockIn</div>
            <div className="text-[11px] text-muted">Locker Scanning Station</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session && (
            <span
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                session.open ? "border-ok/35 bg-ok/10 text-emerald-200" : "border-border bg-surface2 text-muted"
              }`}
            >
              <DoorOpen size={11} />
              {session.open ? `Collection open${session.sectionLabel ? ` — ${session.sectionLabel}` : ""}` : "Collection closed"}
            </span>
          )}
          <a href="/login" className="flex items-center gap-1.5 text-xs text-faint hover:text-primary-hi hover:underline">
            <LogIn size={13} /> Staff sign in
          </a>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-16">
        {phase === "scan" && (
          <div className="w-full max-w-[400px]">
            <div className="card">
              <h2 className="mb-1 text-center text-[15px] font-bold">Scan your QR code</h2>
              <p className="mb-4 text-center text-xs text-muted">Hold your Project LockIn QR code steady in front of the camera.</p>

              <div className="relative mx-auto flex min-h-[300px] w-[300px] items-center justify-center overflow-hidden rounded-md border border-border bg-elevated">
                <div id="qr-reader" className="w-full [&_video]:w-full" />
                {cameraError && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                    <CameraOff size={26} className="text-faint" />
                    <span className="text-xs text-faint">No camera detected</span>
                  </div>
                )}
                <div className="pointer-events-none absolute left-2.5 top-2.5 h-6 w-6 rounded-tl-md border-l-[3px] border-t-[3px] border-primary-hi" />
                <div className="pointer-events-none absolute right-2.5 top-2.5 h-6 w-6 rounded-tr-md border-r-[3px] border-t-[3px] border-primary-hi" />
                <div className="pointer-events-none absolute bottom-2.5 left-2.5 h-6 w-6 rounded-bl-md border-b-[3px] border-l-[3px] border-primary-hi" />
                <div className="pointer-events-none absolute bottom-2.5 right-2.5 h-6 w-6 rounded-br-md border-b-[3px] border-r-[3px] border-primary-hi" />
              </div>
              {cameraError && (
                <p className="mt-3 text-center text-xs text-muted">Camera unavailable ({cameraError}). Use the simulate-scan option below.</p>
              )}

              <div className="mt-5 border-t border-dashed border-border pt-4">
                <label className="field-label">No camera available? Simulate scan for</label>
                <select className="input" value={selectedToken} onChange={(e) => setSelectedToken(e.target.value)}>
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.qrToken}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary mt-2.5 w-full" onClick={simulateScan} disabled={!selectedToken}>
                  <ScanLine size={14} /> Simulate Scan
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === "confirm" && pending && (
          <div className="w-full max-w-[420px] text-center">
            <div className="card">
              {retryCount > 0 && (
                <div className="mb-3.5 flex items-center justify-center gap-1.5 rounded-full bg-danger/15 px-3 py-1.5 text-[11.5px] font-semibold text-danger">
                  <RotateCcw size={12} /> Try again — attempt {retryCount + 1}
                </div>
              )}
              <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-violet text-xl font-extrabold text-white">
                {initials(pending.student.name)}
              </div>
              <h2 className="text-[20px] font-bold">Hi, {pending.student.name}!</h2>
              <p className="mt-1 text-[13px] text-muted">
                {pending.action === "deposit" ? (
                  <>
                    Place your phone in <strong className="text-text">{pending.slot.label}</strong>
                  </>
                ) : (
                  <>Retrieving your phone from {pending.slot.label}</>
                )}
              </p>
              {pending.action === "deposit" ? (
                <>
                  <p className="mt-5 text-[13.5px]">Did you place it in {pending.slot.label}?</p>
                  <div className="mt-4 flex gap-3">
                    <button className="btn-ok flex-1 flex-col gap-1.5 !py-4" onClick={() => confirm(true)}>
                      <CheckCircle2 size={22} />
                      Yes, placed correctly
                    </button>
                    <button className="btn-danger flex-1 flex-col gap-1.5 !py-4" onClick={() => confirm(false)}>
                      <ShieldAlert size={22} />
                      No, wrong slot
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-5 text-[13.5px]">Please confirm — is the phone in the locker actually yours?</p>
                  <div className="mt-4 flex gap-3">
                    <button className="btn-ok flex-1 flex-col gap-1.5 !py-4" onClick={() => confirm(true)}>
                      <CheckCircle2 size={22} />
                      Yes, it's mine
                    </button>
                    <button className="btn-danger flex-1 flex-col gap-1.5 !py-4" onClick={() => confirm(false)}>
                      <ShieldAlert size={22} />
                      No, wrong phone
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {flash && (
        <div className={`fixed inset-0 z-[500] flex flex-col items-center justify-center gap-3.5 p-5 text-center ${flash.ok ? "bg-emerald-950/95" : "bg-rose-950/95"}`}>
          <div
            className={`flex h-[92px] w-[92px] items-center justify-center rounded-full border-2 ${
              flash.ok ? "border-ok text-ok shadow-[0_0_40px_rgba(41,196,141,0.4)]" : "border-danger text-danger shadow-[0_0_40px_rgba(240,86,126,0.4)] animate-shake"
            }`}
          >
            {flash.ok ? <CheckCircle2 size={44} /> : <XCircle size={44} />}
          </div>
          <h2 className="text-[22px] font-bold text-white">{flash.title}</h2>
          <p className="max-w-[320px] text-[13.5px] text-white/70">{flash.message}</p>
        </div>
      )}
    </div>
  );
}
