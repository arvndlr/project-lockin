import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export function DropdownMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuWidth = 176;
      setPos({ top: r.bottom + 6, left: Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8) });
    };
    place();

    const onClick = (e: MouseEvent) => {
      if (
        btnRef.current &&
        !btnRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface2 hover:text-text"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={15} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[950] w-44 overflow-hidden rounded-md border border-border bg-surface2 py-1 shadow-lg2 animate-fadeIn"
            style={{ top: pos.top, left: pos.left }}
          >
            {actions.map((a) => (
              <button
                key={a.label}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] font-medium transition-colors hover:bg-surfaceHover ${
                  a.danger ? "text-danger" : "text-text"
                }`}
                onClick={() => {
                  setOpen(false);
                  a.onClick();
                }}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
