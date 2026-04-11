import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { api, type Exercise, type SwimmerPerformance } from "@/lib/api";
import type { SwimRecordWithPool } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { shouldShowRecords } from "@/pages/Profile";
import { Check, ChevronDown, ChevronRight, Dumbbell, Edit2, Download, RefreshCw, StickyNote, Trash2, Trophy, Waves, X, AlertCircle } from "lucide-react";
import { InlineBanner } from "@/components/shared/InlineBanner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { motion, useReducedMotion } from "framer-motion";
import { staggerChildren, listItem, successBounce } from "@/lib/animations";
import { compareSwimEvents } from "@/lib/swim-sort";
import { PageHeader } from "@/components/shared/PageHeader";
import { eventCodeFromFfnName, FFN_EVENTS, eventLabel } from "@/lib/objectiveHelpers";

type OneRmRecord = {
  exercise_id: number;
  weight?: number | null;
  recorded_at?: string | null;
  date?: string | null;
  notes?: string | null;
};

type SwimMode = "training" | "comp" | "history";
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

function formatDateShort(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Display formatter: seconds -> mm:ss.cc or ss.cc */
function formatTimeSeconds(value?: number | null) {
  if (value === null || value === undefined) return "—";
  const ms = Math.round(Math.max(0, value * 1000));
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const centi = Math.floor((ms % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centi).padStart(2, "0")}`;
  }
  return `${seconds}.${String(centi).padStart(2, "0")}`;
}

/** Parser: accepts "75.32", "1:02.34", "0:59.9" -> seconds (float) */
function parseTimeInputToSeconds(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const [mPart, secPartRaw] = s.split(":");
    const m = Number(mPart);
    if (!Number.isFinite(m) || m < 0) return null;
    const sec = Number(secPartRaw.replace(",", "."));
    if (!Number.isFinite(sec) || sec < 0) return null;
    return m * 60 + sec;
  }
  const v = Number(s.replace(",", "."));
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

function InlineEditBar({
  value,
  placeholder,
  onSave,
  onCancel,
  inputMode = "decimal",
  hint,
}: {
  value: string;
  placeholder: string;
  onSave: (draft: string) => void;
  onCancel: () => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            inputMode={inputMode}
            className="h-10 rounded-xl"
            autoFocus
          />
          {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
        </div>

        <Button
          type="button"
          onClick={() => onSave(draft)}
          className="min-h-[44px] min-w-[44px] h-10 w-10 p-0 rounded-xl"
          aria-label="Valider"
        >
          <Check className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="min-h-[44px] min-w-[44px] h-10 w-10 p-0 rounded-xl"
          aria-label="Annuler"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

const SkeletonRow = () => <div className="h-10 rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />;

export default function Records() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const prefersReducedMotion = useReducedMotion();

  const [mainTab, setMainTab] = useState<"swim" | "1rm">(() => {
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx >= 0) {
      const params = new URLSearchParams(hash.substring(qIdx));
      if (params.get("tab") === "1rm") return "1rm";
    }
    return "swim";
  });

  const emptySwimForm = {
    id: null as number | null,
    event_name: "",
    pool_length: "",
    time_seconds: "",
    record_date: "",
    notes: "",
  };

  const [swimMode, setSwimMode] = useState<SwimMode>("comp");
  const [swimForm, setSwimForm] = useState(emptySwimForm);
  const [swimSheetOpen, setSwimSheetOpen] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<number | null>(null);
  const [editingOneRmValue, setEditingOneRmValue] = useState<string>("");
  const [expandedExerciseId, setExpandedExerciseId] = useState<number | null>(null);
  const [editingNoteExerciseId, setEditingNoteExerciseId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>("");

  // History tab state
  const [histPoolLen, setHistPoolLen] = useState<25 | 50>(25);
  const [histExpandedEvent, setHistExpandedEvent] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [histDays, setHistDays] = useState<number | null>(360); // null = all time
  const [histComparePool, setHistComparePool] = useState(false);

  const showRecords = shouldShowRecords(role);


  /**
   * Scroll to top on initial mount only (avoid stale scroll position on navigation).
   * Does NOT re-scroll on tab switch / focus / visibility change to avoid hijacking
   * the user's scroll position during normal usage.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  // --- SOURCE OF TRUTH: queries / keys / endpoints unchanged ---
  const oneRmQuery = useQuery<OneRmRecord[]>({
    queryKey: ["1rm", user, userId],
    queryFn: () => api.get1RM({ athleteName: user, athleteId: userId }),
    enabled: !!user && showRecords,
  });

  const exercisesQuery = useQuery({
    queryKey: ["exercises"],
    queryFn: () => api.getExercises(),
    enabled: showRecords,
  });

  const swimRecordsQuery = useQuery({
    queryKey: ["swim-records", userId, user, "training"],
    queryFn: () => api.getSwimRecords({ athleteId: userId ?? undefined, athleteName: user ?? undefined, recordType: "training" }),
    enabled: !!user && showRecords && swimMode === "training",
  });

  // Profile query (for IUF)
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => api.getProfile({ userId: userId ?? undefined }),
    enabled: !!userId && showRecords,
  });
  const userIuf = String(profileQuery.data?.ffn_iuf ?? "").trim();

  const mainError = oneRmQuery.error || exercisesQuery.error || profileQuery.error;
  const refetchAll = () => {
    oneRmQuery.refetch();
    exercisesQuery.refetch();
    profileQuery.refetch();
  };

  // Swimmer performances query (history tab)
  const performancesQuery = useQuery<SwimmerPerformance[]>({
    queryKey: ["swimmer-performances", userId, userIuf, histPoolLen],
    queryFn: () =>
      api.getSwimmerPerformances({
        userId: userId ?? undefined,
        iuf: userIuf || undefined,
        poolLength: histPoolLen,
      }),
    enabled: !!userIuf && showRecords,
  });

  const { data: performances, isLoading: perfLoading, isError: perfIsError } = performancesQuery;

  // Other pool performances (for comparison overlay)
  const otherPoolLen = histPoolLen === 25 ? 50 : 25;
  const otherPoolQuery = useQuery<SwimmerPerformance[]>({
    queryKey: ["swimmer-performances", userId, userIuf, otherPoolLen],
    queryFn: () =>
      api.getSwimmerPerformances({
        userId: userId ?? undefined,
        iuf: userIuf || undefined,
        poolLength: otherPoolLen,
      }),
    enabled: !!userIuf && showRecords,
    staleTime: 5 * 60 * 1000,
  });

  // Objectives query (for target line on chart)
  const { data: objectives = [] } = useQuery({
    queryKey: ["athlete-objectives"],
    queryFn: () => api.getAthleteObjectives(),
    enabled: showRecords,
  });

  // Import performances mutation
  const importPerformances = useMutation({
    mutationFn: () => {
      if (!userIuf) throw new Error("IUF FFN manquant. Ajoutez-le dans votre profil.");
      return api.importSwimmerPerformances({ iuf: userIuf, userId: userId ?? undefined });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["swimmer-performances"] });
      toast({
        title: "Import terminé",
        description: `${data.total_found} trouvée(s), ${data.new_imported} importée(s), ${data.already_existed} déjà existante(s)`,
      });
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 2000);
    },
    onError: (e: Error) => {
      toast({
        title: "Import impossible",
        description: String(e?.message || e),
        variant: "destructive",
      });
    },
  });

  // Cutoff date for history filter
  const histCutoff = useMemo(() => {
    if (histDays == null) return null;
    const d = new Date();
    d.setDate(d.getDate() - histDays);
    return d.toISOString().slice(0, 10);
  }, [histDays]);

  // Group performances by event_code, sorted by stroke+distance (all time for list)
  const groupedPerformances = useMemo(() => {
    if (!performances?.length) return [];
    const map = new Map<string, SwimmerPerformance[]>();
    for (const p of performances) {
      const list = map.get(p.event_code) ?? [];
      list.push(p);
      map.set(p.event_code, list);
    }

    const norm = (s: string) => s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
    const strokeKey = (s: string) => {
      const n = norm(s);
      if (n.includes("nl") || n.includes("nage libre")) return 0;
      if (n.includes("dos")) return 1;
      if (n.includes("bra") || n.includes("brasse")) return 2;
      if (n.includes("pap") || n.includes("papillon")) return 3;
      if (n.includes("4n") || n.includes("4 n") || n.includes("4 nages")) return 4;
      return 99;
    };
    const distance = (s: string) => {
      const m = s.match(/^(\d+)/);
      return m ? Number(m[1]) : Infinity;
    };

    return [...map.entries()]
      .map(([eventCode, perfs]) => {
        const sorted = [...perfs].sort(
          (a, b) => (b.competition_date ?? "").localeCompare(a.competition_date ?? "")
        );
        const best = sorted.reduce((min, p) => (p.time_seconds < min.time_seconds ? p : min), sorted[0]);
        return { eventCode, performances: sorted, bestTime: best.time_seconds, bestId: best.id };
      })
      .sort((a, b) => {
        const sa = strokeKey(a.eventCode);
        const sb = strokeKey(b.eventCode);
        if (sa !== sb) return sa - sb;
        return distance(a.eventCode) - distance(b.eventCode);
      });
  }, [performances]);

  // Chart data for expanded event (ascending date order)
  const chartData = useMemo(() => {
    if (!histExpandedEvent) return [];
    const group = groupedPerformances.find((g) => g.eventCode === histExpandedEvent);
    if (!group) return [];

    // Build main pool data points (filtered by timeline cutoff)
    const mainPoints = [...group.performances]
      .filter((p) => p.competition_date && (!histCutoff || p.competition_date >= histCutoff))
      .sort((a, b) => (a.competition_date ?? "").localeCompare(b.competition_date ?? ""))
      .map((p) => ({
        rawDate: p.competition_date ?? "",
        date: formatDateShort(p.competition_date),
        time: p.time_seconds,
        timeOther: undefined as number | undefined,
        display: p.time_display ?? formatTimeSeconds(p.time_seconds),
      }));

    if (!histComparePool || !otherPoolQuery.data) return mainPoints;

    // Build other pool data points for the same event
    const otherPerfs = otherPoolQuery.data
      .filter((p) => p.event_code === histExpandedEvent && p.competition_date)
      .filter((p) => !histCutoff || (p.competition_date ?? "") >= histCutoff);
    if (otherPerfs.length === 0) return mainPoints;

    // Merge into a single timeline
    const map = new Map<string, (typeof mainPoints)[0]>();
    for (const pt of mainPoints) map.set(pt.rawDate, pt);
    for (const p of otherPerfs) {
      const key = p.competition_date ?? "";
      const existing = map.get(key);
      if (existing) {
        existing.timeOther = p.time_seconds;
      } else {
        map.set(key, {
          rawDate: key,
          date: formatDateShort(p.competition_date),
          time: undefined as unknown as number,
          timeOther: p.time_seconds,
          display: "",
        });
      }
    }
    return [...map.values()].sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [histExpandedEvent, groupedPerformances, histComparePool, otherPoolQuery.data, histCutoff]);

  const selectedHistoryGroup = useMemo(
    () => groupedPerformances.find((group) => group.eventCode === histExpandedEvent) ?? null,
    [groupedPerformances, histExpandedEvent],
  );

  // Target time from objective for the expanded event
  const chartTargetTime = useMemo(() => {
    if (!histExpandedEvent) return null;
    // eslint-disable-next-line no-console
    console.log("[EAC] obj debug:", { histExpandedEvent, objCode: eventCodeFromFfnName(histExpandedEvent), objectives: objectives.length, objs: objectives.map(o => o.event_code + ":" + o.target_time_seconds) });
    const objCode = eventCodeFromFfnName(histExpandedEvent);
    if (!objCode) return null;
    const obj = objectives.find(
      (o) => o.event_code === objCode && o.target_time_seconds,
    );
    return obj?.target_time_seconds ?? null;
  }, [histExpandedEvent, objectives]);

  const { data: oneRMs, isLoading: oneRmLoading, isError: oneRmIsError } = oneRmQuery;
  const { data: exercises, isLoading: exercisesLoading, isError: exercisesIsError } = exercisesQuery;
  const { data: swimRecords, isLoading: swimLoading, isError: swimIsError } = swimRecordsQuery;

  const activePoolLen = histPoolLen;

  // Training swim records filtered by pool length
  const filteredSwimRecords = useMemo(() => {
    const list = (swimRecords as { records?: SwimRecordWithPool[] } | undefined)?.records ?? [];
    return list
      .filter((r) => {
        const pl = r?.pool_length ?? r?.poolLength ?? r?.poolLen;
        const n = typeof pl === "number" ? pl : Number(pl);
        return n === histPoolLen;
      })
      .sort((a, b) => compareSwimEvents(String(a.event_name ?? ""), String(b.event_name ?? "")));
  }, [swimRecords, histPoolLen]);

  // --- SOURCE OF TRUTH: mutations / invalidateQueries unchanged ---
  const update1RM = useMutation({
    mutationFn: (data: { exercise_id: number; one_rm?: number; weight?: number }) => api.update1RM({ ...data, athlete_id: userId, athlete_name: user }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["1rm"] });
      toast({ title: "1RM mis à jour" });
    },
  });

  const updateExerciseNote = useMutation({
    mutationFn: (data: { exercise_id: number; notes: string | null }) =>
      api.updateExerciseNote({ athlete_id: userId!, exercise_id: data.exercise_id, notes: data.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["1rm"] });
      toast({ title: "Note mise à jour" });
    },
  });

  const upsertSwimRecord = useMutation({
    mutationFn: (data: Parameters<typeof api.upsertSwimRecord>[0]) => api.upsertSwimRecord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swim-records"] });
      setSwimForm(emptySwimForm);
      setSwimSheetOpen(false);
      toast({ title: "Record mis à jour" });
    },
  });

  const deleteSwimRecordMut = useMutation({
    mutationFn: (id: number) => api.deleteSwimRecord(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swim-records"] });
      setSwimSheetOpen(false);
      setSwimForm(emptySwimForm);
      toast({ title: "Record supprimé" });
    },
  });

  const openAddSwim = () => {
    setSwimForm({ ...emptySwimForm, pool_length: String(histPoolLen) });
    setSwimSheetOpen(true);
  };

  const openEditSwim = (record: SwimRecordWithPool) => {
    setSwimForm({
      id: record.id,
      event_name: record.event_name ?? "",
      pool_length: String(record.pool_length ?? record.poolLength ?? record.poolLen ?? ""),
      time_seconds: record.time_seconds != null ? formatTimeSeconds(record.time_seconds) : "",
      record_date: record.record_date ?? "",
      notes: record.notes ?? "",
    });
    setSwimSheetOpen(true);
  };

  const submitSwimForm = () => {
    if (!swimForm.event_name.trim()) {
      toast({ title: "Nom d'épreuve requis", variant: "destructive" });
      return;
    }
    if (!swimForm.pool_length) {
      toast({ title: "Bassin requis", variant: "destructive" });
      return;
    }
    const seconds = parseTimeInputToSeconds(swimForm.time_seconds);
    if (seconds === null) {
      toast({ title: "Temps invalide", description: "Ex: 1:02.34 ou 62.34", variant: "destructive" });
      return;
    }
    upsertSwimRecord.mutate({
      id: swimForm.id || null,
      athlete_id: userId,
      athleteName: user,
      athlete_name: user,
      event_name: swimForm.event_name,
      pool_length: parseInt(swimForm.pool_length, 10),
      time_seconds: seconds,
      record_date: swimForm.record_date || null,
      notes: swimForm.notes || null,
      record_type: "training",
    });
  };

  const handleSwimSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitSwimForm();
  };

  const setModeSafe = (mode: SwimMode) => {
    setSwimMode(mode);
  };

  const openOneRmEdit = (exerciseId: number, current?: number | null) => {
    setEditingExerciseId(exerciseId);
    setEditingOneRmValue(current != null && Number(current) > 0 ? String(current) : "");
  };

  const cancelOneRmEdit = () => {
    setEditingExerciseId(null);
    setEditingOneRmValue("");
  };

  const saveOneRmEdit = (exerciseId: number, draft: string) => {
    const v = Number(String(draft ?? "").replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      toast({ title: "Valeur invalide", description: "Entrez un nombre > 0", variant: "destructive" });
      return;
    }
    update1RM.mutate({ exercise_id: exerciseId, one_rm: v });
    cancelOneRmEdit();
  };

  // Grid columns removed — using flex card layout instead

  if (!showRecords) {
    return (
      <div className="min-h-[100dvh]">
        <div className="mx-auto max-w-lg px-4 pt-16 pb-10 text-center">
          <Waves className="h-10 w-10 mx-auto text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">
            Cette page est réservée aux nageurs.
          </p>
        </div>
      </div>
    );
  }

  if (mainError) {
    return (
      <div className="min-h-[100dvh]">
        <div className="mx-auto max-w-lg px-4 pt-16 pb-10 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive/60" />
          <p className="mt-3 text-sm font-semibold">Impossible de charger les données</p>
          <p className="mt-1 text-xs text-muted-foreground">{(mainError as Error).message}</p>
          <Button onClick={refetchAll} size="sm" className="mt-4 rounded-2xl">
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]">
      <div className="mx-auto max-w-lg">
        <PageHeader
          className="-mx-0"
          title="Mes Records"
          icon={<Trophy className="h-3.5 w-3.5" />}
          backHref="/profile"
          backLabel="Retour au profil"
        />

        <div className="px-3 pt-3">
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "swim" | "1rm")}>
            <TabsList className="w-full rounded-2xl bg-muted/50 border border-border p-1 flex">
              <TabsTrigger
                value="swim"
                aria-label="Records de natation"
                className="flex-1 rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-wide gap-1.5
                  data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm
                  data-[state=inactive]:text-muted-foreground"
              >
                <Waves className="h-4 w-4" />
                Natation
              </TabsTrigger>
              <TabsTrigger
                value="1rm"
                aria-label="Records de musculation"
                className="flex-1 rounded-xl px-3 py-2 text-sm font-bold uppercase tracking-wide gap-1.5
                  data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm
                  data-[state=inactive]:text-muted-foreground"
              >
                <Dumbbell className="h-4 w-4" />
                Musculation
              </TabsTrigger>
            </TabsList>

            {mainTab === "swim" ? (
              <div className="mt-2.5 space-y-1.5">
                {/* Row 1: source pills left, pool pills right */}
                <div className="flex items-center gap-2">
                  {(["training", "comp"] as const).map((src) => {
                    const label = src === "training" ? "Entraînement" : "Compétition";
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() => {
                          setModeSafe(src);
                          setHistExpandedEvent(null);
                        }}
                        className={cx(
                          "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                          swimMode === src
                            ? "border-primary/30 bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                        )}
                        aria-pressed={swimMode === src}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <div className="ml-auto flex items-center gap-1.5">
                    {([25, 50] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setHistPoolLen(v)}
                        className={cx(
                          "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                          activePoolLen === v
                            ? "border-primary/30 bg-primary/5 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                        )}
                      >
                        {v}m
                      </button>
                    ))}
                    <motion.div variants={successBounce} animate={importSuccess ? "visible" : "hidden"}>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => importPerformances.mutate()}
                        disabled={importPerformances.isPending || !userIuf}
                        className="rounded-xl text-xs h-8 gap-1"
                      >
                        {importPerformances.isPending ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        {importPerformances.isPending ? "Import..." : "Importer"}
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </div>
            ) : null}

            <TabsContent value="swim" className="mt-0">
              {swimMode === "training" ? (
                <div className="mt-3 space-y-2">
                  {swimLoading ? (
                    <div className="grid gap-3">
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </div>
                  ) : swimIsError ? (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                      Impossible de charger les records d&apos;entraînement.
                    </div>
                  ) : filteredSwimRecords.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      <Waves className="h-8 w-8 mx-auto text-muted-foreground/30" />
                      <p className="mt-2">Aucun record en {histPoolLen}m</p>
                    </div>
                  ) : (
                    <motion.div
                      className="grid grid-cols-2 gap-2 motion-reduce:animate-none"
                      variants={prefersReducedMotion ? undefined : staggerChildren}
                      initial={prefersReducedMotion ? false : "hidden"}
                      animate={prefersReducedMotion ? false : "visible"}
                    >
                      {filteredSwimRecords.map((record) => (
                        <motion.div key={record.id} variants={listItem}>
                          <Card
                            className="rounded-2xl h-full cursor-pointer active:scale-[0.97] transition-transform"
                            onClick={() => openEditSwim(record)}
                          >
                            <CardContent className="p-0">
                              <div className="flex flex-col gap-1 px-3 py-3">
                                <span className="text-sm font-semibold truncate">{record.event_name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-primary font-bold tabular-nums text-sm">
                                    {formatTimeSeconds(record.time_seconds)}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground tabular-nums">
                                    {formatDateShort(record.record_date)}
                                  </span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  <Button type="button" size="sm" variant="outline" onClick={openAddSwim} className="w-full rounded-xl text-xs h-8 gap-1">
                    Ajouter un record
                  </Button>

                  <Sheet open={swimSheetOpen} onOpenChange={setSwimSheetOpen}>
                    <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
                      <SheetHeader className="text-left">
                        <SheetTitle className="flex items-center gap-2">
                          <span className="text-lg leading-none">🏊</span>
                          {swimForm.id ? "Modifier le record" : "Nouveau record"}
                        </SheetTitle>
                        <SheetDescription>
                          Meilleur temps réalisé à l&apos;entraînement.
                        </SheetDescription>
                      </SheetHeader>
                      <form onSubmit={handleSwimSubmit} className="mt-5 space-y-5">
                        {/* Épreuve — Select avec FFN_EVENTS */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">🏁</span>
                            <Label className="text-xs font-semibold">Épreuve</Label>
                          </div>
                          <Select
                            value={swimForm.event_name}
                            onValueChange={(value) => setSwimForm({ ...swimForm, event_name: value })}
                          >
                            <SelectTrigger className="h-10 rounded-xl">
                              <SelectValue placeholder="Choisir une épreuve" />
                            </SelectTrigger>
                            <SelectContent>
                              {FFN_EVENTS.map((code) => (
                                <SelectItem key={code} value={eventLabel(code)}>
                                  {eventLabel(code)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Bassin — toggle pills */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">📏</span>
                            <Label className="text-xs font-semibold">Bassin</Label>
                          </div>
                          <div className="flex gap-1.5">
                            {(["25", "50"] as const).map((len) => (
                              <button
                                key={len}
                                type="button"
                                onClick={() => setSwimForm({ ...swimForm, pool_length: len })}
                                className={cx(
                                  "flex-1 h-10 rounded-xl border text-sm font-bold transition-all active:scale-95",
                                  swimForm.pool_length === len
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-muted border-border text-muted-foreground hover:bg-muted/70"
                                )}
                              >
                                {len}m
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Temps + Date */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none">⏱️</span>
                              <Label className="text-xs font-semibold">Temps</Label>
                            </div>
                            <Input
                              value={swimForm.time_seconds}
                              inputMode="decimal"
                              placeholder="1:02.34"
                              onChange={(e) => setSwimForm({ ...swimForm, time_seconds: e.target.value })}
                              className="h-10 rounded-xl font-mono tabular-nums"
                            />
                            <p className="text-[10px] text-muted-foreground">Format : mm:ss.cc ou ss.cc</p>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base leading-none">📅</span>
                              <Label className="text-xs font-semibold">Date</Label>
                            </div>
                            <Input
                              type="date"
                              value={swimForm.record_date}
                              onChange={(e) => setSwimForm({ ...swimForm, record_date: e.target.value })}
                              className="h-10 rounded-xl"
                            />
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">📝</span>
                            <Label className="text-xs font-semibold">Notes</Label>
                          </div>
                          <textarea
                            value={swimForm.notes}
                            onChange={(e) => setSwimForm({ ...swimForm, notes: e.target.value })}
                            placeholder="Contexte, sensations… (optionnel)"
                            rows={2}
                            maxLength={500}
                            className="w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-none"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pb-2">
                          {swimForm.id ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (swimForm.id && confirm("Supprimer ce record ?")) {
                                  deleteSwimRecordMut.mutate(swimForm.id);
                                }
                              }}
                              disabled={deleteSwimRecordMut.isPending}
                              className="rounded-xl h-11 px-3 text-destructive border-destructive/30 hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" onClick={() => setSwimSheetOpen(false)} className="flex-1 rounded-xl h-11">
                              Annuler
                            </Button>
                          )}
                          <Button type="submit" disabled={upsertSwimRecord.isPending} className="flex-1 rounded-xl h-11 font-semibold">
                            {upsertSwimRecord.isPending ? "Enregistrement…" : "Enregistrer"}
                          </Button>
                        </div>
                      </form>
                    </SheetContent>
                  </Sheet>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {/* Alerts */}
                  <InlineBanner
                    variant="destructive"
                    icon={<AlertCircle />}
                    label="Impossible de charger votre profil"
                    visible={profileQuery.isError}
                    animate={false}
                  />

                  <InlineBanner
                    variant="yellow"
                    icon={<AlertCircle />}
                    label="IUF FFN non renseigné"
                    sublabel={<>Renseignez votre numéro dans <a href="/#/profile" className="underline font-medium hover:text-foreground">votre profil</a></>}
                    visible={!profileQuery.isError && !userIuf && !profileQuery.isLoading}
                    animate={false}
                  />

                  {/* Event-grouped performance cards */}
                  {perfLoading ? (
                    <div className="grid gap-3">
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </div>
                  ) : perfIsError ? (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                      <p className="font-semibold">Impossible de charger les performances</p>
                      <p className="mt-1 text-xs">
                        {performancesQuery.error instanceof Error
                          ? performancesQuery.error.message
                          : "Vérifiez votre connexion internet et réessayez."}
                      </p>
                    </div>
                  ) : groupedPerformances.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      {userIuf
                        ? "Aucune performance trouvée. Cliquez sur \"Importer\" pour récupérer vos données FFN."
                        : "Ajoutez votre IUF FFN dans votre profil pour commencer."}
                    </div>
                  ) : (
                    <motion.div
                      className="space-y-2 motion-reduce:animate-none"
                      variants={prefersReducedMotion ? undefined : staggerChildren}
                      initial={prefersReducedMotion ? false : "hidden"}
                      animate={prefersReducedMotion ? false : "visible"}
                    >
                      {groupedPerformances.map((group) => {
                        const bestPerformance =
                          group.performances.find((perf) => perf.id === group.bestId) ?? group.performances[0];

                        return (
                          <motion.div key={group.eventCode} variants={listItem}>
                            <Card className="rounded-2xl">
                              <CardContent className="p-0">
                                <button
                                  type="button"
                                  onClick={() => setHistExpandedEvent(group.eventCode)}
                                  className="w-full flex items-center justify-between gap-3 px-3 py-3 text-left cursor-pointer"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-sm font-semibold truncate">
                                        {group.eventCode}
                                      </span>
                                      <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                                        {group.performances.length}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[11px] text-muted-foreground tabular-nums">
                                      ({formatDateShort(bestPerformance?.competition_date)})
                                    </span>
                                    <span className="font-mono text-primary font-bold tabular-nums text-sm">
                                      {formatTimeSeconds(group.bestTime)}
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                </button>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}

                  <Sheet
                    open={Boolean(selectedHistoryGroup)}
                    onOpenChange={(open) => {
                      if (!open) {
                        setHistExpandedEvent(null);
                      }
                    }}
                  >
                    <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
                      <SheetHeader className="text-left">
                        <SheetTitle>{selectedHistoryGroup?.eventCode ?? "Historique"}</SheetTitle>
                        <SheetDescription>
                          {selectedHistoryGroup
                            ? `${selectedHistoryGroup.performances.length} performance${selectedHistoryGroup.performances.length > 1 ? "s" : ""} en bassin ${histPoolLen}m`
                            : "Historique détaillé"}
                        </SheetDescription>
                      </SheetHeader>

                      {selectedHistoryGroup ? (
                        <div className="mt-5 space-y-4">
                          {chartData.length > 1 ? (
                            <div className="rounded-2xl border border-border bg-muted/20 px-2 pt-3 pb-1">
                              <div className="flex items-center justify-between mb-2 px-2">
                                <span className="text-xs text-muted-foreground">
                                  Courbe de progression
                                </span>
                                <button
                                  type="button"
                                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                                    histComparePool
                                      ? "bg-orange-500 text-white"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                                  }`}
                                  onClick={() => setHistComparePool((v) => !v)}
                                >
                                  {histComparePool ? `${histPoolLen}m + ${otherPoolLen}m` : `+ ${otherPoolLen}m`}
                                </button>
                              </div>
                              <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 5 }}>
                                  <defs>
                                    <linearGradient id="objLine" x1="0" y1="0" x2="1" y2="0">
                                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.85} />
                                      <stop offset="50%" stopColor="#10b981" stopOpacity={0.85} />
                                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.85} />
                                    </linearGradient>
                                    <filter id="dotGlow">
                                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                                      <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                      </feMerge>
                                    </filter>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                                  <YAxis
                                    domain={[
                                      (dataMin: number) => chartTargetTime != null ? Math.min(dataMin, chartTargetTime) - 0.5 : dataMin,
                                      (dataMax: number) => chartTargetTime != null ? Math.max(dataMax, chartTargetTime) + 0.5 : dataMax,
                                    ]}
                                    tick={{ fontSize: 10 }}
                                    className="text-muted-foreground"
                                    reversed
                                    tickFormatter={(v: number) => {
                                      const min = Math.floor(v / 60);
                                      const sec = Math.floor(v % 60);
                                      const cs = Math.round((v % 1) * 100);
                                      return min > 0 ? `${min}:${String(sec).padStart(2, "0")}` : `${sec}.${String(cs).padStart(2, "0")}`;
                                    }}
                                  />
                                  <Tooltip
                                    formatter={(value: number, name: string) => {
                                      const min = Math.floor(value / 60);
                                      const sec = Math.floor(value % 60);
                                      const cs = Math.round((value % 1) * 100);
                                      const display = min > 0
                                        ? `${min}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`
                                        : `${sec}.${String(cs).padStart(2, "0")}`;
                                      const label = name === "timeOther" ? `${otherPoolLen}m` : `${histPoolLen}m`;
                                      return [display, label];
                                    }}
                                    labelStyle={{ fontSize: 11 }}
                                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                                  />
                                  {chartTargetTime != null && (
                                    <ReferenceLine
                                      y={chartTargetTime}
                                      stroke="#f59e0b"
                                      strokeWidth={2}
                                      strokeDasharray="8 4"
                                      ifOverflow="extendDomain"
                                    />
                                  )}
                                  <Line
                                    type="monotone"
                                    dataKey="time"
                                    name="time"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={(props: any) => {
                                      const { cx: dx, cy: dy, payload, key } = props;
                                      if (payload.time == null) return <g key={key} />;
                                      const beats = chartTargetTime != null && payload.time <= chartTargetTime;
                                      return beats ? (
                                        <g key={key} filter="url(#dotGlow)">
                                          <circle cx={dx} cy={dy} r={4.5} fill="#10b981" stroke="#fff" strokeWidth={1.5} />
                                        </g>
                                      ) : (
                                        <circle key={key} cx={dx} cy={dy} r={3} fill="hsl(var(--primary))" stroke="#fff" strokeWidth={1} />
                                      );
                                    }}
                                    activeDot={{ r: 5 }}
                                    connectNulls
                                  />
                                  {histComparePool && (
                                    <Line
                                      type="monotone"
                                      dataKey="timeOther"
                                      name="timeOther"
                                      stroke="hsl(var(--chart-2, 25 95% 53%))"
                                      strokeWidth={2}
                                      strokeDasharray="4 2"
                                      dot={{ r: 2.5 }}
                                      activeDot={{ r: 4 }}
                                      connectNulls
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                              {/* Objective badge */}
                              {chartTargetTime && (
                                <div className="flex items-center justify-center px-2 pt-1 pb-1">
                                  <div className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-amber-500/10 border border-amber-400/25 dark:border-amber-500/20 px-3 py-1">
                                    <span className="inline-block w-4 h-[2px] rounded-full bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500" />
                                    <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">Objectif</span>
                                    <span className="text-[11px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                      {formatTimeSeconds(chartTargetTime)}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {histComparePool && (
                                <div className="flex items-center justify-center gap-4 px-2 pb-1 pt-0.5">
                                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <span className="inline-block w-3 h-0.5 rounded-full bg-primary" />
                                    {histPoolLen}m
                                  </span>
                                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <span className="inline-block w-3 h-0.5 rounded-full" style={{ background: "hsl(var(--chart-2, 25 95% 53%))" }} />
                                    {otherPoolLen}m
                                  </span>
                                </div>
                              )}
                              {/* Timeline filter pills */}
                              <div className="flex gap-1.5 overflow-x-auto px-2 pb-2 pt-1">
                                {([
                                  { label: "90j", days: 90 },
                                  { label: "6 mois", days: 180 },
                                  { label: "1 an", days: 360 },
                                  { label: "2 ans", days: 730 },
                                  { label: "Tout", days: null },
                                ] as const).map((opt) => (
                                  <button
                                    key={opt.label}
                                    type="button"
                                    className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                                      histDays === opt.days
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                    }`}
                                    onClick={() => setHistDays(opt.days)}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="overflow-hidden rounded-2xl border border-border">
                            <div className="divide-y divide-border">
                              {selectedHistoryGroup.performances.map((perf) => {
                                const isBest = perf.id === selectedHistoryGroup.bestId;
                                const beatsObjective = chartTargetTime != null && perf.time_seconds <= chartTargetTime;
                                return (
                                  <div
                                    key={perf.id}
                                    className={cx(
                                      "px-3 py-2.5",
                                      beatsObjective ? "bg-emerald-500/5" : isBest ? "bg-primary/5" : undefined,
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        {isBest ? <Trophy className="h-3.5 w-3.5 text-primary shrink-0" /> : null}
                                        <span className="text-xs text-muted-foreground tabular-nums">
                                          {formatDateShort(perf.competition_date)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {beatsObjective && (
                                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                                        )}
                                        <span
                                          className={cx(
                                            "font-mono tabular-nums text-sm",
                                            beatsObjective
                                              ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                              : isBest ? "text-primary font-bold" : "font-medium",
                                          )}
                                        >
                                          {perf.time_display ?? formatTimeSeconds(perf.time_seconds)}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                      {perf.ffn_points != null ? (
                                        <span className="tabular-nums">{String(perf.ffn_points)} pts</span>
                                      ) : null}
                                      {perf.competition_name ? (
                                        <span className="truncate">{perf.competition_name}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </SheetContent>
                  </Sheet>
                </div>
              )}

              <div className="h-6" />
            </TabsContent>

            <TabsContent value="1rm" className="mt-0">
              <div className="mt-3">
              <Card className="w-full min-w-0 rounded-2xl">
                <CardContent className="p-0">
                  {oneRmLoading || exercisesLoading ? (
                    <div className="p-4 grid gap-3">
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                    </div>
                  ) : oneRmIsError || exercisesIsError ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Impossible de charger les records musculation.
                    </div>
                  ) : (
                    <motion.div
                      className="divide-y divide-border motion-reduce:animate-none"
                      variants={prefersReducedMotion ? undefined : staggerChildren}
                      initial={prefersReducedMotion ? false : "hidden"}
                      animate={prefersReducedMotion ? false : "visible"}
                    >
                      {(exercises as Exercise[])
                        ?.filter((e) => e.exercise_type !== "warmup")
                        .map((ex) => {
                          const record = oneRMs?.find((r) => r.exercise_id === ex.id);
                          const recordWeight = Number(record?.weight ?? 0);
                          const displayWeight = recordWeight > 0 ? `${recordWeight} kg` : "—";
                          const recordDate = record?.recorded_at ?? record?.date ?? null;
                          const exerciseNote = record?.notes ?? null;

                          const isEditing = editingExerciseId === ex.id;
                          const isExpanded = expandedExerciseId === ex.id;
                          const isEditingNote = editingNoteExerciseId === ex.id;

                          return (
                            <motion.div key={ex.id} className="px-3 py-2.5 motion-reduce:animate-none" variants={listItem}>
                              {/* Line 1: Exercise name + note icon + weight + edit */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1 min-w-0">
                                  <span className="text-sm font-semibold truncate">{ex.nom_exercice}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isEditingNote) {
                                        setEditingNoteExerciseId(null);
                                        setNoteDraft("");
                                      } else {
                                        setEditingNoteExerciseId(ex.id);
                                        setNoteDraft(exerciseNote ?? "");
                                      }
                                    }}
                                    className={cx(
                                      "inline-flex items-center justify-center h-6 w-6 rounded-lg transition shrink-0",
                                      exerciseNote
                                        ? "text-primary hover:text-primary/80"
                                        : "text-muted-foreground/40 hover:text-muted-foreground",
                                    )}
                                    aria-label={exerciseNote ? "Modifier la note" : "Ajouter une note"}
                                  >
                                    <StickyNote className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={cx(
                                    "font-mono font-bold tabular-nums text-sm",
                                    recordWeight > 0 ? "text-primary" : "text-muted-foreground"
                                  )}>
                                    {displayWeight}
                                  </span>
                                  {!isEditing && (
                                    <button
                                      type="button"
                                      onClick={() => openOneRmEdit(ex.id, record?.weight ?? null)}
                                      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition"
                                      aria-label={`Modifier ${ex.nom_exercice}`}
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Line 2: Date + note text + % toggle */}
                              <div className="flex items-center justify-between mt-0.5">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                                  <span className="tabular-nums shrink-0">{formatDateShort(recordDate)}</span>
                                  {exerciseNote && !isEditingNote ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNoteExerciseId(ex.id);
                                        setNoteDraft(exerciseNote ?? "");
                                      }}
                                      className="truncate italic hover:text-foreground transition text-left"
                                      title="Modifier la note"
                                    >
                                      {exerciseNote}
                                    </button>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {recordWeight > 0 && !isEditing ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedExerciseId(isExpanded ? null : ex.id)}
                                      className="inline-flex items-center gap-0.5 h-7 px-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition"
                                      aria-label="Table des pourcentages"
                                    >
                                      <ChevronDown className={cx("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                                      <span className="text-[10px] font-bold">%</span>
                                    </button>
                                  ) : null}
                                </div>
                              </div>

                              {/* Inline 1RM edit */}
                              {isEditing ? (
                                <div className="mt-3">
                                  <InlineEditBar
                                    value={editingOneRmValue}
                                    placeholder="Ex: 100"
                                    inputMode="decimal"
                                    hint="Charge max (kg)."
                                    onCancel={cancelOneRmEdit}
                                    onSave={(draft) => saveOneRmEdit(ex.id, draft)}
                                  />
                                </div>
                              ) : null}

                              {/* Inline note edit */}
                              {isEditingNote ? (
                                <div className="mt-3">
                                  <div className="flex items-start gap-2">
                                    <Input
                                      value={noteDraft}
                                      onChange={(e) => setNoteDraft(e.target.value)}
                                      placeholder="Machine n°3, cran 5..."
                                      className="h-9 rounded-lg text-sm flex-1"
                                      autoFocus
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        const trimmed = noteDraft.trim() || null;
                                        updateExerciseNote.mutate({ exercise_id: ex.id, notes: trimmed });
                                        setEditingNoteExerciseId(null);
                                        setNoteDraft("");
                                      }}
                                      disabled={updateExerciseNote.isPending}
                                      className="rounded-lg min-h-[44px] min-w-[44px] h-9 w-9 p-0 shrink-0"
                                      aria-label="Enregistrer"
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => { setEditingNoteExerciseId(null); setNoteDraft(""); }}
                                      className="rounded-lg min-h-[44px] min-w-[44px] h-9 w-9 p-0 shrink-0"
                                      aria-label="Annuler"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : null}

                              {/* Percentage table */}
                              {isExpanded && recordWeight > 0 ? (
                                <div className="mt-3 rounded-xl bg-muted/30 border border-border p-3">
                                  <div className="grid grid-cols-5 gap-2 text-center text-xs">
                                    {[50, 60, 70, 80, 90].map((pct) => (
                                      <div key={pct} className="space-y-0.5">
                                        <div className="text-[10px] text-muted-foreground font-medium">{pct}%</div>
                                        <div className="font-bold tabular-nums font-mono">{Math.round(recordWeight * pct / 10) / 10}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </motion.div>
                          );
                        })}
                    </motion.div>
                  )}

                  {update1RM.isPending ? (
                    <div className="px-4 pb-4 text-xs text-muted-foreground flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Mise à jour...
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              </div>
              <div className="h-6" />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
