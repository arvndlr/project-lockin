import { Search, X } from "lucide-react";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full max-w-[260px]">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        className="input !pl-8 !pr-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-text"
          onClick={() => onChange("")}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
