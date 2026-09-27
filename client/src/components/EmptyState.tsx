import type { ReactNode } from "react";

export function EmptyState({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-10 text-center text-faint">
      <div className="mb-2.5 opacity-50">{icon}</div>
      <div className="text-[13.5px] font-semibold text-muted">{title}</div>
      {sub && <div className="mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3.5 py-3">
              <div className="h-3.5 w-full animate-shimmer rounded bg-gradient-to-r from-surface2 via-surfaceHover to-surface2 bg-[length:400%_100%]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
