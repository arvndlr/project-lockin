import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    setOpts(null);
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-5 animate-fadeIn"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              {opts.danger && (
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                  <AlertTriangle size={17} />
                </div>
              )}
              <div>
                <h3 className="text-[15px] font-bold">{opts.title}</h3>
                {opts.description && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{opts.description}</p>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button className="btn-secondary" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={opts.danger ? "btn-danger" : "btn-primary"} onClick={() => close(true)}>
                {opts.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
