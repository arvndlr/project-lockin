import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ScanLine, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

const DEMO_ACCOUNTS = [
  { role: "Admin", username: "admin", password: "admin123" },
  { role: "Teacher", username: "teacher1", password: "teacher123" },
  { role: "Student", username: "student1", password: "student123" },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(username, password);
      navigate(`/${user.role.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const fill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError("");
  };

  return (
    <div className="bg-mesh flex min-h-screen items-center justify-center p-5">
      <div className="relative w-full max-w-[380px] overflow-hidden rounded-lg border border-border bg-surface p-8 shadow-lg2">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />

        <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[13px] bg-gradient-to-br from-primary to-violet shadow-glow">
          <Lock size={22} className="text-white" />
        </div>
        <h1 className="text-[21px] font-bold tracking-tight">Project LockIn</h1>
        <p className="mb-6 mt-0.5 text-[12.5px] text-muted">ICCBI Classroom Smartphone Organizer</p>

        <form onSubmit={submit} className="relative">
          <div className="mb-3.5">
            <label className="field-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="mb-1">
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="min-h-[18px] py-2 text-[12.5px] text-danger">{error}</div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
            ) : (
              <LogIn size={15} />
            )}
            Sign In
          </button>
        </form>

        <div className="mt-6 rounded-md border border-border bg-elevated p-3">
          <div className="mb-2 text-[11px] font-semibold text-muted">Demo accounts</div>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.username}
                type="button"
                onClick={() => fill(acc.username, acc.password)}
                className="rounded-full border border-border bg-surface2 px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-primary hover:text-primary-hi"
              >
                {acc.role}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-xs text-faint">
          <ScanLine size={13} />
          <a href="/kiosk" className="text-faint hover:text-primary-hi hover:underline">
            Open locker scanning station
          </a>
        </div>
      </div>
    </div>
  );
}
