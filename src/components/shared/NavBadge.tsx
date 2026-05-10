/**
 * §244 — Pastille de compteur sur bottom nav (pattern iOS Tab.badge).
 */
export function NavBadge({ count, max = 9 }: { count: number; max?: number }) {
  if (count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);
  return (
    <span
      role="status"
      aria-label={`${count} non lus`}
      className="absolute -top-0.5 -right-1 min-w-4 h-4 px-1 rounded-full bg-status-error text-white text-[10px] font-bold leading-none flex items-center justify-center pointer-events-none"
    >
      {display}
    </span>
  );
}
