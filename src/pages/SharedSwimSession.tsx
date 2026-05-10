import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SwimSessionTimeline } from "@/components/swim/SwimSessionTimeline";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, Waves } from "lucide-react";
import { getSharedSession } from "@/lib/api/swim";
import type { SwimSessionItem } from "@/lib/api";

interface SharedSessionData {
  name: string;
  description: string | null;
  items: SwimSessionItem[];
}

export default function SharedSwimSession() {
  const [location] = useLocation();
  const [data, setData] = useState<SharedSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Extract token from route: /s/:token
  const token = location.split("/s/")[1]?.split("?")[0] ?? "";

  useEffect(() => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    getSharedSession(token).then((result) => {
      if (cancelled) return;
      if (result) {
        setData(result);
      } else {
        setError(true);
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 pt-8">
        <div className="mx-auto max-w-lg space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold uppercase">Séance introuvable</h1>
        <p className="text-sm text-muted-foreground">
          Ce lien de partage n'existe pas ou a été désactivé.
        </p>
        <Button onClick={() => window.location.hash = "#/"}>
          Accueil
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-4">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center gap-2 text-xs uppercase tracking-eyebrow-lg text-muted-foreground">
            <Waves className="h-4 w-4" />
            Séance partagée
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold uppercase tracking-tight">
            {data.name}
          </h1>
        </div>
      </div>

      {/* Timeline */}
      <div className="mx-auto max-w-lg px-4 pt-4">
        <SwimSessionTimeline
          title={data.name}
          description={data.description ?? undefined}
          items={data.items}
          showHeader={true}
        />
      </div>

      {/* Fixed CTA banner */}
      <div className="fixed inset-x-0 bottom-0 z-[var(--z-index-bar)] border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Rejoins l'EAC</p>
            <p className="truncate text-xs text-muted-foreground">
              Crée ton compte pour accéder à toutes tes séances
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => window.location.hash = "#/"}
            className="shrink-0"
          >
            S'inscrire
          </Button>
        </div>
      </div>
    </div>
  );
}
