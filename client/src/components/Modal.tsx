import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "440px",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[900] flex items-start justify-center overflow-y-auto bg-black/60 p-5 pt-[8vh] backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full rounded-lg border border-border bg-surface shadow-lg2"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-borderSoft px-6 py-5">
          <div>
            <h3 className="text-[15.5px] font-bold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          <button
            className="-mr-1.5 -mt-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface2 hover:text-text"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
