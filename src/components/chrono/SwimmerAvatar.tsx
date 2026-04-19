import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import type { ChronoSwimmer } from "../../lib/chrono-types";

type AvatarSize = "xs" | "sm" | "md";

const SIZE_CLASS: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[9px]",   // 24px
  sm: "h-8 w-8 text-[11px]",  // 32px
  md: "h-10 w-10 text-sm",    // 40px
};

export function SwimmerAvatar({
  swimmer,
  size = "sm",
  className = "",
}: {
  swimmer: Pick<ChronoSwimmer, "displayName" | "avatarUrl">;
  size?: AvatarSize;
  className?: string;
}) {
  const initials = computeInitials(swimmer.displayName);
  const { bg, fg } = colorFromName(swimmer.displayName);
  return (
    <Avatar className={`${SIZE_CLASS[size]} ring-1 ring-border/40 ${className}`}>
      {swimmer.avatarUrl && (
        <AvatarImage
          src={swimmer.avatarUrl}
          alt={swimmer.displayName}
          loading="lazy"
          decoding="async"
        />
      )}
      <AvatarFallback
        className="font-bold uppercase tracking-tight"
        style={{ backgroundColor: bg, color: fg }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFromName(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return { bg: `hsl(${hue}, 55%, 45%)`, fg: "#fff" };
}
