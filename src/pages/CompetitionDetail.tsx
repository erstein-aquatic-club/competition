import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import InfoMyObjectives from "@/components/competition/InfoMyObjectives";
import InfoParticipants from "@/components/competition/InfoParticipants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Trophy, MapPin, CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateRange(start: string, end?: string | null): string {
  if (!end || end === start) return formatDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function countdownBadge(days: number): { label: string; variant: "default" | "secondary" | "outline" } {
  if (days < 0) return { label: "Terminée", variant: "outline" };
  if (days === 0) return { label: "Aujourd'hui", variant: "default" };
  return { label: `J-${days}`, variant: "secondary" };
}

export default function CompetitionDetail() {
  const [, params] = useRoute("/competition/:id");
  const [, navigate] = useLocation();
  const competitionId = params?.id ?? null;

  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role) ?? "athlete";
  // authUid is hydrated synchronously from the Supabase session in the
  // Zustand store (loginFromSession + loadUser). Avoids the auth-bootstrap
  // race that an async useQuery(supabase.auth.getUser) would have.
  const authUid = useAuth((s) => s.authUid);

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const competition = useMemo(
    () => competitions.find((c) => c.id === competitionId) ?? null,
    [competitions, competitionId],
  );

  const days = competition ? daysUntil(competition.date) : null;
  const badge = days != null ? countdownBadge(days) : null;

  if (!competition) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-4">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <EmptyState
          icon={<Trophy />}
          title="Compétition introuvable"
          description="Elle a peut-être été supprimée."
        />
      </div>
    );
  }

  const isAthlete = role === "athlete";

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 pb-28 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
          className="mt-0.5 h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition shrink-0"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="text-lg font-bold">{competition.name}</h1>
            {badge && (
              <Badge variant={badge.variant} className="text-[10px] px-2 py-0.5 shrink-0">
                {badge.label}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {formatDateRange(competition.date, competition.end_date)}
            </span>
            {competition.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {competition.location}
              </span>
            )}
          </div>

          {competition.description && (
            <p className="text-xs text-muted-foreground/80">{competition.description}</p>
          )}
        </div>
      </div>

      {/* Section adaptée au rôle */}
      {isAthlete ? (
        <InfoMyObjectives
          competitionId={competition.id}
          competitionName={competition.name}
          userId={userId}
          authUid={authUid}
        />
      ) : (
        <InfoParticipants competitionId={competition.id} />
      )}

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-10">
        <div className="mx-auto max-w-3xl">
          <Button
            type="button"
            className="w-full h-11"
            onClick={() => navigate(`/competition/${competition.id}/prep`)}
          >
            Préparer la compétition
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
