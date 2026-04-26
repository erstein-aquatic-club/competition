import React, { useEffect, useState } from "react";
import { Dumbbell, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExerciseGifProps {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** When true, downgrade missing-src/error UI to a tiny "offline" hint. */
  offline?: boolean;
  /** Render as an inline button-like element (caller wraps in <button>) — only affects pointer styling. */
  interactive?: boolean;
  iconClassName?: string;
}

// Reused across WorkoutRunner header, RestExerciseTab and ExercisePicker.
// Three guarantees vs raw <img>:
//  - key={src} forces a fresh image element when the URL changes (no stale
//    pixels lingering after a substitution while the browser fetches the new
//    asset — that visual ghost was perceived as "wrong GIF").
//  - onLoad / onError tracks state explicitly so we can show a skeleton
//    while loading and a Dumbbell fallback when the network or storage fails.
//  - Skeleton fades on first paint (no layout shift on cold loads).
export function ExerciseGif({
  src,
  alt = "",
  className,
  imgClassName,
  offline = false,
  iconClassName,
}: ExerciseGifProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error",
  );

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  if (!src || status === "error") {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/30 text-muted-foreground/50",
          className,
        )}
        aria-label={offline ? "Illustration indisponible hors ligne" : "Illustration indisponible"}
        role="img"
      >
        {offline ? (
          <ImageOff className={cn("h-1/2 w-1/2", iconClassName)} />
        ) : (
          <Dumbbell className={cn("h-1/2 w-1/2", iconClassName)} />
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {status === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-muted/40" />
      )}
      <img
        key={src}
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={cn(
          "h-full w-full transition-opacity duration-200",
          status === "loaded" ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </div>
  );
}

export default ExerciseGif;
