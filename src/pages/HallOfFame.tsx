import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHallOfFame } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Dumbbell, Waves, Heart, AlertCircle, Medal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HallOfFameValue } from "@/pages/hallOfFame/HallOfFameValue";
import { Podium } from "@/pages/hallOfFame/Podium";
import type { PodiumEntry } from "@/pages/hallOfFame/Podium";
import {
  formatHallOfFameValue,
  getValueRange,
  normalizeHallOfFameScore,
  toRelativeScore,
} from "@/pages/hallOfFame/valueUtils";
import { Link } from "wouter";
import { subDays, format } from "date-fns";
import type { HallOfFameData, HallOfFameSwimDistance, HallOfFameSwimPerformance, HallOfFameSwimEngagement, HallOfFameStrength } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";

const PERIOD_OPTIONS = [
  { value: "7", label: "7j" },
  { value: "30", label: "30j" },
  { value: "90", label: "3 mois" },
  { value: "365", label: "1 an" },
] as const;

export default function HallOfFame() {
  const [periodDays, setPeriodDays] = useState<string>("30");

  // Reset view state when dock icon is tapped while already on this page
  useEffect(() => {
    const reset = () => {
      setPeriodDays("30");
    };
    window.addEventListener("nav:reset", reset);
    return () => window.removeEventListener("nav:reset", reset);
  }, []);

  const fromDate = useMemo(() => {
    return format(subDays(new Date(), Number(periodDays)), "yyyy-MM-dd");
  }, [periodDays]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["hall-of-fame", fromDate],
    queryFn: () => getHallOfFame(fromDate),
  });

  const rawSwimDistance = (data as HallOfFameData | undefined)?.distance ?? [];
  const rawSwimPerformance = (data as HallOfFameData | undefined)?.performance ?? [];
  const rawSwimEngagement = (data as HallOfFameData | undefined)?.engagement ?? [];
  const strengthStats = (data as HallOfFameData | undefined)?.strength ?? [];
  const swimDistance = rawSwimDistance.map((item: HallOfFameSwimDistance) => ({
    ...item,
    total_distance: Number(item.total_distance ?? 0),
  }));
  const swimPerformance = rawSwimPerformance.map((item: HallOfFameSwimPerformance) => ({
    ...item,
    avg_effort: normalizeHallOfFameScore(item.avg_effort),
  }));
  const swimEngagement = rawSwimEngagement.map((item: HallOfFameSwimEngagement) => ({
    ...item,
    avg_engagement: normalizeHallOfFameScore(item.avg_engagement),
  }));
  const strengthTonnage = [...strengthStats]
    .sort((a, b) => Number(b.total_volume ?? 0) - Number(a.total_volume ?? 0))
    .slice(0, 5);
  const strengthReps = [...strengthStats]
    .sort((a, b) => Number(b.total_reps ?? 0) - Number(a.total_reps ?? 0))
    .slice(0, 5);
  const distanceRange = getValueRange(swimDistance.map((item) => Number(item.total_distance ?? 0)));
  const tonnageRange = getValueRange(strengthTonnage.map((item) => Number(item.total_volume ?? 0)));
  const repsRange = getValueRange(strengthReps.map((item) => Number(item.total_reps ?? 0)));

  // Podium top 3 + rest for each category
  const distanceTop3: PodiumEntry[] = swimDistance.slice(0, 3).map((item) => ({
    name: item.athlete_name,
    value: formatHallOfFameValue(item.total_distance / 1000, { decimals: 1, suffix: "km" }),
    toneScore: toRelativeScore(item.total_distance, distanceRange),
    avatarUrl: item.avatar_url,
  }));
  const distanceRest = swimDistance.slice(3);

  const performanceTop3: PodiumEntry[] = swimPerformance.slice(0, 3).map((item) => ({
    name: item.athlete_name,
    value: formatHallOfFameValue(item.avg_effort, { decimals: 1 }),
    toneScore: item.avg_effort,
    avatarUrl: item.avatar_url,
  }));
  const performanceRest = swimPerformance.slice(3);

  const engagementTop3: PodiumEntry[] = swimEngagement.slice(0, 3).map((item) => ({
    name: item.athlete_name,
    value: formatHallOfFameValue(item.avg_engagement, { decimals: 1 }),
    toneScore: item.avg_engagement,
    avatarUrl: item.avatar_url,
  }));
  const engagementRest = swimEngagement.slice(3);

  const tonnageTop3: PodiumEntry[] = strengthTonnage.slice(0, 3).map((item) => ({
    name: item.athlete_name,
    value: formatHallOfFameValue(Number(item.total_volume ?? 0), { suffix: "kg" }),
    toneScore: toRelativeScore(Number(item.total_volume ?? 0), tonnageRange),
    avatarUrl: item.avatar_url,
  }));
  const tonnageRest = strengthTonnage.slice(3);

  const repsTop3: PodiumEntry[] = strengthReps.slice(0, 3).map((item) => ({
    name: item.athlete_name,
    value: formatHallOfFameValue(Number(item.total_reps ?? 0), { suffix: "reps" }),
    toneScore: toRelativeScore(Number(item.total_reps ?? 0), repsRange),
    avatarUrl: item.avatar_url,
  }));
  const repsRest = strengthReps.slice(3);

  if (isLoading) {
    return (
      <div className="space-y-6" aria-live="polite" aria-busy="true">
        <div className="sr-only">Chargement du Hall of Fame...</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>

        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={`skeleton-${i}`} className="border-t-4">
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={`item-${j}`} className="flex items-center justify-between gap-3 p-3">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-6 w-6" />
                        <Skeleton className="h-5 w-32" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">{(error as Error).message}</p>
        <Button onClick={() => refetch()} className="mt-4">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classements"
        icon={<Medal className="h-3.5 w-3.5" />}
        action={(
          <Link href="/records-club">
            <Button variant="outline" size="sm" className="border-primary/20 text-primary hover:bg-primary/5">Records club</Button>
          </Link>
        )}
      />

      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriodDays(opt.value)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
              periodDays === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Tabs defaultValue="swim" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="swim"><Waves className="mr-2 h-4 w-4"/> Bassin</TabsTrigger>
            <TabsTrigger value="strength"><Dumbbell className="mr-2 h-4 w-4"/> Muscu</TabsTrigger>
        </TabsList>

        <TabsContent value="swim" className="space-y-6 pt-4 animate-in slide-in-from-left-4 motion-reduce:animate-none">
             {/* Podium colors (yellow, orange, rose, emerald, violet) are intentionally hardcoded for visual distinction */}
             <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card className="border-t-4 border-t-yellow-500 shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      Top Distance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Podium entries={distanceTop3} />
                    {distanceRest.length > 0 && (
                      <div className="space-y-2 mt-4">
                        {distanceRest.map((item, idx) => {
                          const distanceKm = item.total_distance ? item.total_distance / 1000 : 0;
                          return (
                            <div key={item.athlete_name} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                              <div className="flex items-center gap-4 min-w-0">
                                <span className="font-mono font-bold text-muted-foreground w-6 text-center">{idx + 4}</span>
                                <div className="font-bold uppercase tracking-tight truncate">{item.athlete_name}</div>
                              </div>
                              <div className="shrink-0">
                                <HallOfFameValue
                                  value={formatHallOfFameValue(distanceKm, { decimals: 1, suffix: "km" })}
                                  toneScore={toRelativeScore(item.total_distance, distanceRange)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-t-4 border-t-orange-500 shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="h-5 w-5 text-orange-500" />
                      Top Intensité (RPE Avg)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Podium entries={performanceTop3} />
                    {performanceRest.length > 0 && (
                      <div className="space-y-2 mt-4">
                        {performanceRest.map((item, idx) => (
                          <div key={item.athlete_name} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-4 min-w-0">
                              <span className="font-mono font-bold text-muted-foreground w-6 text-center">{idx + 4}</span>
                              <div className="font-bold uppercase tracking-tight truncate">{item.athlete_name}</div>
                            </div>
                            <div className="shrink-0">
                              <HallOfFameValue
                                value={formatHallOfFameValue(item.avg_effort, { decimals: 1 })}
                                toneScore={item.avg_effort}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-t-4 border-t-rose-500 shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Heart className="h-5 w-5 text-rose-500" />
                      Top Engagement
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Podium entries={engagementTop3} />
                    {engagementRest.length > 0 && (
                      <div className="space-y-2 mt-4">
                        {engagementRest.map((item, idx) => (
                          <div key={`${item.athlete_name}-engagement`} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-4 min-w-0">
                              <span className="font-mono font-bold text-muted-foreground w-6 text-center">{idx + 4}</span>
                              <div className="font-bold uppercase tracking-tight truncate">{item.athlete_name}</div>
                            </div>
                            <div className="shrink-0">
                              <HallOfFameValue
                                value={formatHallOfFameValue(item.avg_engagement, { decimals: 1 })}
                                toneScore={item.avg_engagement}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
            </div>
        </TabsContent>

        <TabsContent value="strength" className="space-y-6 pt-4 animate-in slide-in-from-right-4 motion-reduce:animate-none">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card className="border-t-4 border-t-emerald-500 shadow-md">
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Trophy className="h-5 w-5 text-emerald-500" />
                        Top Tonnage
                      </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Podium entries={tonnageTop3} />
                    {tonnageRest.length > 0 && (
                      <div className="space-y-2 mt-4">
                        {tonnageRest.map((item, idx) => (
                          <div key={item.athlete_name} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-4 min-w-0">
                              <span className="font-mono font-bold text-muted-foreground w-6 text-center">{idx + 4}</span>
                              <div className="font-bold uppercase tracking-tight truncate">{item.athlete_name}</div>
                            </div>
                            <div className="shrink-0">
                              <HallOfFameValue
                                value={formatHallOfFameValue(Number(item.total_volume ?? 0), { suffix: "kg" })}
                                toneScore={toRelativeScore(Number(item.total_volume ?? 0), tonnageRange)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
              </Card>

              <Card className="border-t-4 border-t-violet-500 shadow-md">
                  <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Trophy className="h-5 w-5 text-violet-500" />
                        Top Volume (Répétitions)
                      </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Podium entries={repsTop3} />
                    {repsRest.length > 0 && (
                      <div className="space-y-2 mt-4">
                        {repsRest.map((item, idx) => (
                          <div key={`${item.athlete_name}-reps`} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-4 min-w-0">
                              <span className="font-mono font-bold text-muted-foreground w-6 text-center">{idx + 4}</span>
                              <div className="font-bold uppercase tracking-tight truncate">{item.athlete_name}</div>
                            </div>
                            <div className="shrink-0">
                              <HallOfFameValue
                                value={formatHallOfFameValue(Number(item.total_reps ?? 0), { suffix: "reps" })}
                                toneScore={toRelativeScore(Number(item.total_reps ?? 0), repsRange)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
              </Card>
            </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
