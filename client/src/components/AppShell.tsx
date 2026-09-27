import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Menu, X, Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "./Avatar";

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export function AppShell({
  navItems,
  activeKey,
  onNavigate,
  roleLabel,
  title,
  subtitle,
  headerActions,
  children,
}: {
  navItems: NavItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  roleLabel: string;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const Sidebar = (
    <aside className={`sidebar sticky top-0 flex h-screen w-[248px] flex-col border-r border-borderSoft bg-elevated p-3.5 ${mobileOpen ? "flex" : ""}`}>
      <div className="flex items-center gap-2.5 px-2 pb-5 pt-1.5">
        <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-violet shadow-glow">
          <Lock size={17} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-bold tracking-tight">Project LockIn</div>
          <div className="text-[11px] text-muted">{roleLabel}</div>
        </div>
        <button className="ml-auto md:hidden text-muted" onClick={() => setMobileOpen(false)}>
          <X size={18} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={activeKey === item.key ? "nav-item-active" : "nav-item"}
            onClick={() => {
              onNavigate(item.key);
              setMobileOpen(false);
            }}
          >
            <span className="opacity-90">{item.icon}</span>
            {item.label}
            {!!item.badge && (
              <span className="ml-auto rounded-full bg-danger/20 px-1.5 py-px text-[10px] font-bold text-danger">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-3 border-t border-borderSoft pt-3">
        <div className="flex items-center gap-2.5 rounded-sm p-2">
          <Avatar name={user?.name || "?"} size={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{user?.name}</div>
            <div className="text-[11px] text-muted">{user?.username}</div>
          </div>
          <button
            className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-sm text-muted transition-colors hover:border hover:border-border hover:bg-surface2 hover:text-danger"
            onClick={handleLogout}
            title="Log out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-bg">
      <div className="hidden md:grid md:grid-cols-[248px_1fr]">
        {Sidebar}
        <main className="min-w-0">
          <Topbar title={title} subtitle={subtitle} actions={headerActions} />
          <div className="mx-auto max-w-[1280px] px-8 pb-16 pt-7">{children}</div>
        </main>
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <div className="flex items-center gap-3 border-b border-borderSoft px-4 py-3.5">
          <button className="text-muted" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="text-[14px] font-bold">{title}</div>
        </div>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <div className="relative z-10">{Sidebar}</div>
          </div>
        )}
        <div className="px-4 pb-14 pt-5">{children}</div>
      </div>
    </div>
  );
}

function Topbar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-borderSoft bg-bg/75 px-8 py-5 backdrop-blur-md">
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}
