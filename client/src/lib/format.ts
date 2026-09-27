export function initials(name: string): string {
  const letters = name.match(/[A-Z]/g) || [];
  return (letters[0] || name[0] || "?") + (letters[1] || "");
}

const AVATAR_HUES = ["from-primary to-violet", "from-info to-primary", "from-ok to-info", "from-warn to-danger", "from-violet to-danger"];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length];
}
