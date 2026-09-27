import { initials, avatarGradient } from "../lib/format";

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ${avatarGradient(name)}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {initials(name)}
    </div>
  );
}
