import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function SwimmerHome() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [, navigate] = useLocation();

  const { data: profile } = useQuery({
    queryKey: ["profile", user, userId],
    queryFn: () => api.getProfile({ displayName: user, userId }),
    enabled: !!user,
  });

  const firstName = (profile?.display_name || user || "").split(" ")[0];
  const today = format(new Date(), "EEEE d MMMM", { locale: fr });

  return (
    <div className="mx-auto max-w-lg px-4 pb-24">
      {/* Section A — Header */}
      <div className="flex items-center justify-between pt-4 pb-3">
        <div>
          <h1 className="text-xl font-semibold">Bonjour {firstName}</h1>
          <p className="text-sm text-muted-foreground capitalize">{today}</p>
        </div>
        <button onClick={() => navigate("/profile")} className="shrink-0">
          <Avatar className="h-8 w-8 ring-2 ring-primary/20">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {firstName?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
        </button>
      </div>

      {/* Placeholder for sections B-F — will be added by parallel agents */}
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center py-8">Sections en cours de construction...</p>
      </div>
    </div>
  );
}
