/**
 * MesocycleGeneration — écran nageur de configuration d'un mésocycle muscu.
 *
 * Feature « Bilan Muscu → Mésocycle », Chantier C+D (§293, Phase 5).
 *
 * Rôle
 * ────
 *  Le nageur, son bilan muscu complété, vient ici pour configurer son
 *  prochain mésocycle. Cet écran ne génère rien ni ne persiste : il
 *  rassemble 5 paramètres puis hand-offe à l'écran d'aperçu via
 *  sessionStorage + navigate('/strength/mesocycle-preview').
 *
 *  Paramètres collectés (taxonomie nage × distance, §305) :
 *   • stroke            — nage ciblée (chips, 5 clés seedées §305).
 *   • distance          — épreuve/distance (chips filtrés selon la nage).
 *   • kind              — famille de prépa (season | inter_competition).
 *   • target_week_count — durée cible, bornée à [min_week_count, max_week_count]
 *                         du DistanceProfile (distance, kind). Peut s'aligner
 *                         sur une compétition.
 *   • weekdays          — jours muscu cochés (0=Lun…6=Dim, sans samedi). §307.
 *                         Lun/Jeu = amorce PAP avant le sprint bassin, les
 *                         autres jours développent la force. sessions_per_week
 *                         est dérivé = weekdays.length.
 *   • start_date        — date de départ réelle (1re semaine partielle si en
 *                         milieu de semaine). §307.
 *
 * Disclosure
 * ──────────
 *  Les 5 sections sont toutes affichées en pile verticale. Les sections en
 *  aval d'une réponse manquante restent visibles mais grisées + non
 *  interactives — laisser l'aperçu de l'étape suivante visible aide à
 *  l'orientation sans demander de défilement après chaque clic.
 *
 * Focus mode
 * ──────────
 *  `document.body.dataset.focusMode = "strength"` masque le dock du bas
 *  (cf. AppLayout), comme `KpiWizard` et `StrengthQuestionnaire`.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  getAthletes,
  getDistanceProfiles,
  getLatestAssessment,
  getProfile,
  getStrokeSignatures,
} from "@/lib/api";
import type { Competition } from "@/lib/api/types";
import type {
  DistanceKey,
  StrokeKey,
} from "@/lib/strength/mesocycleEngine.types";
import { useAuth } from "@/lib/auth";
import { canGenerateMesocycle } from "@/lib/strength/mesocycleGating";
import { useCompetitionsByWeek } from "@/hooks/useCompetitionsByWeek";
import { getMonday, toISODate, addDays } from "@/lib/date";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Check,
  ChevronRight,
  Dumbbell,
  Minus,
  Plus,
  Target,
} from "lucide-react";

// ── Constantes UI ────────────────────────────────────────────────────────────

/** Ordre stable d'affichage des nages (ne PAS dépendre de l'ordre DB). §305. */
const STROKE_ORDER: StrokeKey[] = [
  "freestyle",
  "butterfly",
  "backstroke",
  "breaststroke",
  "medley",
];

/** Ordre stable d'affichage des distances (du sprint vers le fond). §305 ; +`fond` (R4). */
const DISTANCE_ORDER: DistanceKey[] = ["50", "100", "200", "400plus", "fond"];

/** Labels FR de secours si une ligne du catalogue manque (préférer `row.label`). */
const STROKE_LABELS_FALLBACK: Record<StrokeKey, string> = {
  freestyle: "Crawl",
  butterfly: "Papillon",
  backstroke: "Dos",
  breaststroke: "Brasse",
  medley: "4 nages",
};
const DISTANCE_LABELS_FALLBACK: Record<DistanceKey, string> = {
  "50": "50 m",
  "100": "100 m",
  "200": "200 m",
  "400plus": "400 m",
  fond: "800 m / 1500 m",
};

/** Clé sessionStorage pour le hand-off vers l'écran d'aperçu. */
const SESSION_KEY = "eac_pending_mesocycle_params";

const KIND_OPTIONS: Array<{
  value: "season" | "inter_competition";
  title: string;
  blurb: string;
  range: string;
}> = [
  {
    value: "season",
    title: "Prépa de saison",
    blurb: "Cycle long qui construit la force progressivement sur toute la saison.",
    range: "7 à 23 semaines",
  },
  {
    value: "inter_competition",
    title: "Mini-prépa inter-compétitions",
    blurb: "Cycle court pour relancer entre deux compétitions, sans cassure.",
    range: "5 à 8 semaines",
  },
];

// ── Jours de muscu (§307) ─────────────────────────────────────────────────────

/** Libellés courts FR des 7 jours, indexés 0=Lun…6=Dim. */
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Samedi (5) n'est jamais sélectionnable — pas de muscu le samedi. */
const SATURDAY = 5;

/** `true` si `d` est un jour d'amorce PAP (lundi ou jeudi). §307. */
function isPrimerWeekday(d: number): boolean {
  return d === 0 || d === 3;
}

/**
 * Jours par défaut depuis le nombre de séances de l'évaluation, en favorisant
 * le rythme Lun/Jeu (amorce avant le sprint bassin). §307.
 *  1→[0] · 2→[0,3] · 3→[0,2,4] · 4→[0,1,3,4] · 5→[0,1,2,3,4] · sinon N premiers
 *  jours non-samedi.
 *
 *  §325 — 3 séances = [Lun, Mer, Ven] (et non plus [Lun, Mar, Jeu]) : Lun reste
 *  l'unique amorce, Mer + Ven sont deux vrais jours de développement. L'ancien
 *  [0,1,3] mettait 2 amorces (Lun + Jeu) sur 3 séances, et le seul créneau jambes
 *  tombait le Jeudi (amorce) → converti en amorce haut-du-corps → zéro jambes.
 */
function defaultWeekdaysFor(count: number): number[] {
  switch (count) {
    case 1:
      return [0];
    case 2:
      return [0, 3];
    case 3:
      return [0, 2, 4];
    case 4:
      return [0, 1, 3, 4];
    case 5:
      return [0, 1, 2, 3, 4];
    default: {
      // Sélectionne les N premiers jours en sautant le samedi.
      const out: number[] = [];
      for (let d = 0; d < 7 && out.length < count; d++) {
        if (d !== SATURDAY) out.push(d);
      }
      return out;
    }
  }
}

/**
 * Première date de départ (ISO) tombant sur un jour coché, à partir
 * d'aujourd'hui inclus. Si aucun jour coché cette semaine n'arrive après
 * aujourd'hui, prend le premier jour coché de la semaine prochaine. §307.
 */
function nextTrainingDateIso(weekdays: number[], today: Date): string {
  if (weekdays.length === 0) return toISODate(today);
  const set = new Set(weekdays);
  // Cherche dans les 14 prochains jours (couvre cette semaine + la suivante).
  for (let offset = 0; offset < 14; offset++) {
    const d = addDays(today, offset);
    const jsDay = d.getDay(); // 0=Dim…6=Sam
    const weekday = (jsDay + 6) % 7; // 0=Lun…6=Dim
    if (set.has(weekday)) return toISODate(d);
  }
  return toISODate(today);
}

/** Libellé « Lun · Mar · Jeu » d'une liste de jours triée. */
function formatWeekdayList(weekdays: number[]): string {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(" · ");
}

// ── Helpers internes ─────────────────────────────────────────────────────────

/** Nombre de semaines (entier, arrondi) entre `from` (date, doit être un lundi)
 *  et `targetIso` (YYYY-MM-DD). Renvoie un entier ≥ 0. */
function weeksUntil(targetIso: string, from: Date): number {
  const t = new Date(targetIso + "T00:00:00").getTime();
  const f = from.getTime();
  return Math.max(0, Math.round((t - f) / (7 * 86400000)));
}

/** Format court FR « ven. 17 juil. ». */
const FR_SHORT_DATE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
function fmtShortDate(iso: string): string {
  return FR_SHORT_DATE.format(new Date(iso + "T00:00:00"));
}

/** Pré-tri des compétitions à venir (5 prochaines, par date asc). */
function pickUpcoming(comps: Competition[], todayIso: string, limit = 5): Competition[] {
  return comps
    .filter((c) => c.date && c.date.slice(0, 10) >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function MesocycleGeneration() {
  const userId = useAuth((s) => s.userId);
  const userName = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const isCoach = role === "coach" || role === "admin";
  const [, navigate] = useLocation();

  // Route /coach/mesocycle-generate/:athleteId → on génère pour le nageur
  // ciblé (mode coach) ; route /strength/... → pour soi (session courante).
  const routeParams = useParams<{ athleteId?: string }>();
  const targetAthleteId =
    routeParams.athleteId != null ? Number(routeParams.athleteId) : null;
  const effectiveAthleteId =
    isCoach && targetAthleteId != null ? targetAthleteId : userId;
  const isCoachMode = effectiveAthleteId !== userId;

  // Garde de rôle : un nageur ne peut pas cibler un autre nageur.
  useEffect(() => {
    if (targetAthleteId != null && !isCoach) navigate("/strength");
  }, [targetAthleteId, isCoach, navigate]);

  // Masquer le dock du bas — convention focus mode (cf. KpiWizard).
  useEffect(() => {
    document.body.dataset.focusMode = "strength";
    return () => {
      delete document.body.dataset.focusMode;
    };
  }, []);

  // ── Pré-requis : bilan complété ──────────────────────────────────────────
  const { data: assessment, isLoading: assessmentLoading } = useQuery({
    queryKey: ["strength-assessment-latest", effectiveAthleteId],
    queryFn: () => getLatestAssessment(effectiveAthleteId!),
    enabled: effectiveAthleteId != null,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", effectiveAthleteId],
    queryFn: () => getProfile({ userId: effectiveAthleteId! }),
    enabled: effectiveAthleteId != null,
    staleTime: 5 * 60 * 1000,
  });

  // Nom du nageur ciblé (mode coach uniquement) — en-tête de cible non ambigu.
  const { data: athletes } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    enabled: isCoachMode,
    staleTime: 5 * 60_000,
  });
  const targetName =
    athletes?.find((a) => a.id === effectiveAthleteId)?.display_name ?? null;

  // ── Données du catalogue — taxonomie nage × distance (§305) ──────────────
  const { data: strokeSignatures = [], isLoading: strokesLoading } = useQuery({
    queryKey: ["strength-stroke-signatures"],
    queryFn: () => getStrokeSignatures(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: distanceProfiles = [], isLoading: distanceProfilesLoading } =
    useQuery({
      queryKey: ["strength-distance-profiles"],
      queryFn: () => getDistanceProfiles(),
      staleTime: 5 * 60 * 1000,
    });

  // ── État local des sections ──────────────────────────────────────────────
  const [stroke, setStroke] = useState<StrokeKey | null>(null);
  const [distance, setDistance] = useState<DistanceKey | null>(null);
  const [kind, setKind] = useState<"season" | "inter_competition" | null>(null);
  const [weeks, setWeeks] = useState<number | null>(null);
  // §307 — jours muscu cochés (0=Lun…6=Dim) ; sessions/sem dérivé.
  const [weekdays, setWeekdays] = useState<number[] | null>(null);
  // Sous-ensemble de weekdays en amorce SNC (volume réduit). Défaut : {Lun,Jeu} ∩ weekdays.
  const [primerWeekdays, setPrimerWeekdays] = useState<number[]>([]);
  // §307 — date de départ réelle (ISO YYYY-MM-DD), 1re semaine partielle si en
  // milieu de semaine.
  const [startDate, setStartDate] = useState<string>("");

  // Reset des sections aval quand l'amont change.
  useEffect(() => {
    setDistance(null);
    setKind(null);
    setWeeks(null);
  }, [stroke]);

  useEffect(() => {
    setKind(null);
    setWeeks(null);
  }, [distance]);

  useEffect(() => {
    setWeeks(null);
  }, [kind]);

  // ── Labels des chips (préférer le label du catalogue, fallback statique) ──
  const strokeLabelByKey = useMemo(() => {
    const m = new Map<StrokeKey, string>();
    for (const s of strokeSignatures) m.set(s.stroke_key, s.label);
    return m;
  }, [strokeSignatures]);

  const distanceLabelByKey = useMemo(() => {
    // Une distance a deux lignes (season + inter_competition) avec le même
    // label ; on déduplique par clé pour la libellisation des chips.
    const m = new Map<DistanceKey, string>();
    for (const p of distanceProfiles) if (!m.has(p.distance_key)) m.set(p.distance_key, p.label);
    return m;
  }, [distanceProfiles]);

  // Distances disponibles pour la nage choisie : 50/100/200 pour toutes ;
  // 400plus pour crawl et 4 nages (400 NL + 400 4N) ; `fond` (800/1500)
  // uniquement crawl — épreuves LCM de fond (R4, audit 2026-05-26). §305.
  const availableDistances = useMemo<DistanceKey[]>(() => {
    if (stroke == null) return [];
    const base: DistanceKey[] = ["50", "100", "200"];
    if (stroke === "freestyle" || stroke === "medley") base.push("400plus");
    if (stroke === "freestyle") base.push("fond");
    return DISTANCE_ORDER.filter((d) => base.includes(d));
  }, [stroke]);

  // ── Profil de distance courant (selon distance + kind) → bornes semaines ──
  const distanceProfile = useMemo(
    () =>
      distance != null && kind != null
        ? (distanceProfiles.find(
            (p) => p.distance_key === distance && p.kind === kind,
          ) ?? null)
        : null,
    [distanceProfiles, distance, kind],
  );

  // Quand le profil arrive, initialise `weeks` au milieu de la plage.
  useEffect(() => {
    if (distanceProfile && weeks == null) {
      const mid = Math.round(
        (distanceProfile.min_week_count + distanceProfile.max_week_count) / 2,
      );
      setWeeks(mid);
    }
  }, [distanceProfile, weeks]);

  // ── weekdays — par défaut depuis l'évaluation (favorise Lun/Jeu) §307 ─────
  useEffect(() => {
    if (assessment && weekdays == null) {
      const wd = defaultWeekdaysFor(assessment.sessions_per_week ?? 3);
      setWeekdays(wd);
      setPrimerWeekdays(wd.filter(isPrimerWeekday));
    }
  }, [assessment, weekdays]);

  // ── Compétitions à venir + ancrage temporel ──────────────────────────────
  const { visibleCompetitions } = useCompetitionsByWeek(effectiveAthleteId);

  const todayIso = useMemo(() => toISODate(new Date()), []);

  // §307 — date de départ par défaut = prochain jour coché à partir d'aujourd'hui.
  // Recalculée tant que l'utilisateur n'a pas saisi de date manuellement.
  const [startDateTouched, setStartDateTouched] = useState(false);
  useEffect(() => {
    if (!startDateTouched && weekdays != null && weekdays.length > 0) {
      setStartDate(nextTrainingDateIso(weekdays, new Date()));
    }
  }, [weekdays, startDateTouched]);

  // Lundi de la semaine de départ (dérivé de startDate) — ancre le calcul de
  // l'écart en semaines des compétitions à venir.
  const startMonday = useMemo(
    () => (startDate ? getMonday(new Date(startDate + "T00:00:00")) : getMonday(new Date())),
    [startDate],
  );
  /** `true` si la date de départ ne tombe pas un lundi → 1re semaine partielle. */
  const startIsPartialWeek = useMemo(
    () => startDate !== "" && toISODate(startMonday) !== startDate,
    [startDate, startMonday],
  );

  const upcomingComps = useMemo(
    () => pickUpcoming(visibleCompetitions, todayIso, 5),
    [visibleCompetitions, todayIso],
  );

  /** Pour chaque compétition affichée : nb de semaines entre startMonday et la date. */
  const compsWithGap = useMemo(
    () =>
      upcomingComps.map((c) => ({
        comp: c,
        weeks: weeksUntil(c.date.slice(0, 10), startMonday),
      })),
    [upcomingComps, startMonday],
  );

  // §307 — jours d'amorce et de développement parmi les jours cochés (pilotés par primerWeekdays).
  const primerDaysChosen = primerWeekdays;
  const devDaysChosen = useMemo(
    () => (weekdays ?? []).filter((d) => !primerWeekdays.includes(d)),
    [weekdays, primerWeekdays],
  );
  /** Sprint (50/100) avec uniquement des jours d'amorce → pas de jour de dev force. */
  const sprintNoDevDay =
    (distance === "50" || distance === "100") &&
    (weekdays?.length ?? 0) >= 1 &&
    devDaysChosen.length === 0;

  // ── Validation finale ────────────────────────────────────────────────────
  const canSubmit =
    stroke != null &&
    distance != null &&
    kind != null &&
    distanceProfile != null &&
    weeks != null &&
    weeks >= distanceProfile.min_week_count &&
    weeks <= distanceProfile.max_week_count &&
    weekdays != null &&
    weekdays.length >= 1 &&
    startDate !== "";

  function handleSubmit() {
    if (
      !canSubmit ||
      stroke == null ||
      distance == null ||
      kind == null ||
      weeks == null ||
      weekdays == null ||
      startDate === ""
    )
      return;
    const payload = {
      stroke,
      distance,
      kind,
      targetWeekCount: weeks,
      weekdays: [...weekdays].sort((a, b) => a - b),
      primerWeekdays: [...primerWeekdays].sort((a, b) => a - b),
      startDate,
      athleteId: effectiveAthleteId,
    };
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage indisponible (private mode) — on continue malgré tout
      // via le route state ; l'écran d'aperçu fera son propre fallback.
    }
    navigate("/strength/mesocycle-preview");
  }

  /** Coche/décoche un jour muscu. §307. */
  function toggleWeekday(d: number) {
    setWeekdays((prev) => {
      const base = prev ?? [];
      const removing = base.includes(d);
      if (removing) {
        setPrimerWeekdays((p) => p.filter((x) => x !== d));
      } else if (isPrimerWeekday(d)) {
        setPrimerWeekdays((p) => [...p, d].sort((a, b) => a - b));
      }
      return (removing ? base.filter((x) => x !== d) : [...base, d]).sort((a, b) => a - b);
    });
  }

  /** Bascule le rôle d'un jour sélectionné entre amorce SNC et développement. */
  function togglePrimer(d: number) {
    setPrimerWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  // ── États écran ──────────────────────────────────────────────────────────
  if (assessmentLoading) {
    return <PageSkeleton />;
  }

  const backTarget = isCoachMode
    ? `/coach/swimmer/${effectiveAthleteId}`
    : "/strength";

  if (!assessment || !canGenerateMesocycle(assessment.status)) {
    return <AssessmentRequiredScreen onBack={() => navigate(backTarget)} />;
  }

  return (
    <div className="min-h-dvh bg-muted/30 pb-32">
      <Header onBack={() => navigate(backTarget)} />

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {isCoachMode && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
            <Target className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              Génération pour&nbsp;
              <span className="font-semibold text-foreground">
                {targetName ?? "ce nageur"}
              </span>
            </span>
          </div>
        )}
        {/* ── Section 01 — Nage ────────────────────────────────────────── */}
        <SectionCard
          number="01"
          title="Nage"
          subtitle="Quelle nage veux-tu travailler en priorité ?"
          enabled
          active={stroke == null}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STROKE_ORDER.map((sk) => {
              const selected = stroke === sk;
              return (
                <button
                  key={sk}
                  type="button"
                  onClick={() => setStroke(sk)}
                  className={cn(
                    "min-h-[48px] rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                    selected
                      ? "border-violet-600 bg-violet-600 text-white shadow-sm dark:border-violet-500 dark:bg-violet-500"
                      : "border-border bg-card hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30",
                  )}
                >
                  {strokeLabelByKey.get(sk) ?? STROKE_LABELS_FALLBACK[sk]}
                </button>
              );
            })}
          </div>
          {!strokesLoading && strokeSignatures.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Catalogue de nages indisponible — réessayer plus tard.
            </p>
          )}
        </SectionCard>

        {/* ── Section 02 — Épreuve (distance) ──────────────────────────── */}
        <SectionCard
          number="02"
          title="Épreuve"
          subtitle="Sur quelle distance veux-tu construire ce cycle ?"
          enabled={stroke != null}
          active={stroke != null && distance == null}
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {availableDistances.map((dk) => {
              const selected = distance === dk;
              return (
                <button
                  key={dk}
                  type="button"
                  onClick={() => setDistance(dk)}
                  className={cn(
                    "min-h-[48px] rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                    selected
                      ? "border-violet-600 bg-violet-600 text-white shadow-sm dark:border-violet-500 dark:bg-violet-500"
                      : "border-border bg-card hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30",
                  )}
                >
                  {distanceLabelByKey.get(dk) ?? DISTANCE_LABELS_FALLBACK[dk]}
                </button>
              );
            })}
          </div>
          {!distanceProfilesLoading && distanceProfiles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Catalogue d'épreuves indisponible — réessayer plus tard.
            </p>
          )}
        </SectionCard>

        {/* ── Section 03 — Famille de prépa ────────────────────────────── */}
        <SectionCard
          number="03"
          title="Famille de prépa"
          subtitle="Long terme ou relance entre deux compétitions ?"
          enabled={stroke != null && distance != null}
          active={stroke != null && distance != null && kind == null}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {KIND_OPTIONS.map((opt) => {
              const selected = kind === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setKind(opt.value)}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-violet-600 bg-violet-50 shadow-sm dark:border-violet-500 dark:bg-violet-950/40"
                      : "border-border bg-card hover:border-violet-300",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                        selected
                          ? "border-violet-600 bg-violet-600 dark:border-violet-500 dark:bg-violet-500"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-sm font-semibold">{opt.title}</span>
                  </div>
                  <p className="pl-7 text-xs leading-relaxed text-muted-foreground">
                    {opt.blurb}
                  </p>
                  <p className="pl-7 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                    {opt.range}
                  </p>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Section 04 — Durée cible ─────────────────────────────────── */}
        <SectionCard
          number="04"
          title="Durée cible"
          subtitle={
            distanceProfile
              ? `${distanceProfile.min_week_count}–${distanceProfile.max_week_count} semaines`
              : "Choisis une famille de prépa pour voir la plage disponible."
          }
          enabled={stroke != null && distance != null && kind != null}
          active={
            stroke != null &&
            distance != null &&
            kind != null &&
            weeks != null &&
            (weekdays == null || weekdays.length === 0)
          }
        >
          {distanceProfile && weeks != null && (
            <>
              <DurationTapeMeasure
                weeks={weeks}
                onChange={setWeeks}
                min={distanceProfile.min_week_count}
                max={distanceProfile.max_week_count}
                competitions={compsWithGap}
              />

              <Separator className="my-4" />

              <h4 className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Tes prochaines échéances
              </h4>
              {compsWithGap.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    Aucune compétition à venir. Choisis ta durée librement.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {compsWithGap.map(({ comp, weeks: gap }) => {
                    const inRange =
                      gap >= distanceProfile.min_week_count &&
                      gap <= distanceProfile.max_week_count;
                    const isCurrent = weeks === gap;
                    return (
                      <li key={comp.id}>
                        <button
                          type="button"
                          disabled={!inRange}
                          onClick={() => inRange && setWeeks(gap)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                            !inRange && "opacity-60",
                            inRange && !isCurrent &&
                              "border-border bg-card hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20",
                            isCurrent &&
                              "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300 dark:border-emerald-400 dark:bg-emerald-950/40",
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                              isCurrent
                                ? "bg-emerald-600 text-white"
                                : inRange
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="truncate text-sm font-semibold">{comp.name}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {fmtShortDate(comp.date)}
                              {comp.location ? ` · ${comp.location}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <div
                              className={cn(
                                "font-bold tabular-nums leading-none",
                                inRange ? "text-foreground" : "text-muted-foreground/70",
                              )}
                            >
                              {gap}
                              <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                                sem.
                              </span>
                            </div>
                            {inRange ? (
                              isCurrent ? (
                                <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                                  <Target className="h-2.5 w-2.5" />
                                  Pic ciblé
                                </span>
                              ) : (
                                <span className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-600 dark:text-emerald-400">
                                  Aligner
                                </span>
                              )
                            ) : (
                              <span className="mt-1 inline-block text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                                hors plage
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </SectionCard>

        {/* ── Section 05 — Jours de muscu ──────────────────────────────── */}
        <SectionCard
          number="05"
          title="Jours de muscu"
          subtitle="Coche tes jours. Lun & Jeu = amorce avant le sprint bassin ; les autres développent la force."
          enabled={stroke != null && distance != null && kind != null && weeks != null}
          active={
            stroke != null &&
            distance != null &&
            kind != null &&
            weeks != null &&
            (weekdays == null || weekdays.length === 0)
          }
        >
          {weekdays != null && (
            <WeekdayPicker
              weekdays={weekdays}
              onToggle={toggleWeekday}
              primerSet={new Set(primerWeekdays)}
              onTogglePrimer={togglePrimer}
              primerCount={primerDaysChosen.length}
              devCount={devDaysChosen.length}
              sprintNoDevDay={sprintNoDevDay}
            />
          )}
        </SectionCard>

        {/* ── Section 06 — Date de départ ──────────────────────────────── */}
        <SectionCard
          number="06"
          title="Date de départ"
          subtitle="Quand démarre le cycle ? 1re semaine partielle si tu commences en milieu de semaine."
          enabled={
            stroke != null &&
            distance != null &&
            kind != null &&
            weeks != null &&
            weekdays != null &&
            weekdays.length >= 1
          }
          active={
            weeks != null &&
            weekdays != null &&
            weekdays.length >= 1 &&
            startDate === ""
          }
        >
          <StartDatePicker
            value={startDate}
            min={todayIso}
            onChange={(v) => {
              setStartDateTouched(true);
              setStartDate(v);
            }}
            isPartialWeek={startIsPartialWeek}
          />
        </SectionCard>

        {/* ── Récap discret avant le CTA ───────────────────────────────── */}
        {canSubmit && stroke != null && distance != null && weeks != null && weekdays != null && (
          <Card className="border-violet-200 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700 dark:text-violet-300">
              Récap
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-violet-900 dark:text-violet-100">
              <span className="font-bold">
                {strokeLabelByKey.get(stroke) ?? STROKE_LABELS_FALLBACK[stroke]}
                {" · "}
                {distanceLabelByKey.get(distance) ?? DISTANCE_LABELS_FALLBACK[distance]}
              </span>{" "}
              · <span className="tabular-nums">{weeks}</span> semaines ·{" "}
              <span className="font-semibold">{formatWeekdayList(weekdays)}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-violet-700/80 dark:text-violet-300/80">
              Début {fmtShortDate(startDate)}
            </p>
          </Card>
        )}
      </div>

      {/* ── CTA fixe en bas ──────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <p className="hidden text-xs text-muted-foreground sm:block">
            {profile?.display_name ?? userName ?? ""}
          </p>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="ml-auto flex h-12 items-center gap-2 bg-violet-600 px-5 text-base font-semibold text-white shadow-lg hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
          >
            Voir l'aperçu
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Bilan Muscu
          </p>
          <h1 className="text-base font-bold leading-tight">Générer mon mésocycle</h1>
        </div>
        <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 sm:flex">
          <Dumbbell className="h-4 w-4" />
        </div>
      </div>
      <p className="mx-auto max-w-2xl px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
        Choisis la nage, l'épreuve, la famille de prépa, la durée, tes jours de
        muscu et la date de départ.
      </p>
    </header>
  );
}

interface SectionCardProps {
  number: string;
  title: string;
  subtitle?: string;
  /** Si false → carte non-interactive + voile + grisée. */
  enabled: boolean;
  /** Si true → bord violet à gauche (la section qui « attend » l'utilisateur). */
  active?: boolean;
  children: React.ReactNode;
}

function SectionCard({
  number,
  title,
  subtitle,
  enabled,
  active = false,
  children,
}: SectionCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 transition-opacity",
        !enabled && "pointer-events-none opacity-50",
        active && enabled && "border-violet-300 ring-1 ring-violet-200 dark:border-violet-700 dark:ring-violet-900/50",
      )}
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-6 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[10px] font-black tabular-nums tracking-wider",
            enabled
              ? "bg-violet-600 text-white dark:bg-violet-500"
              : "bg-muted text-muted-foreground",
          )}
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold leading-tight">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

interface DurationTapeMeasureProps {
  weeks: number;
  onChange: (w: number) => void;
  min: number;
  max: number;
  competitions: Array<{ comp: Competition; weeks: number }>;
}

/** Affichage central de la durée : numéral géant + slider + ruler avec marqueurs
 *  de compétition. */
function DurationTapeMeasure({
  weeks,
  onChange,
  min,
  max,
  competitions,
}: DurationTapeMeasureProps) {
  const range = max - min;
  /** Position en % le long du ruler pour une valeur donnée. */
  const pct = (val: number): number =>
    range === 0 ? 50 : ((val - min) / range) * 100;

  return (
    <div className="flex flex-col items-center">
      {/* Numéral géant */}
      <div className="flex items-baseline gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, weeks - 1))}
          aria-label="−1 semaine"
          disabled={weeks <= min}
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex items-baseline px-3">
          <span className="text-7xl font-black tabular-nums leading-none tracking-tighter">
            {weeks}
          </span>
          <span className="ml-1.5 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            sem.
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, weeks + 1))}
          aria-label="+1 semaine"
          disabled={weeks >= max}
          className="flex h-10 w-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Slider + ruler */}
      <div className="mt-4 w-full px-1">
        <Slider
          value={[weeks]}
          min={min}
          max={max}
          step={1}
          onValueChange={(v) => onChange(v[0])}
          trackClassName="h-2 bg-muted"
          rangeClassName="bg-violet-600 dark:bg-violet-500"
        />

        {/* Ruler avec marqueurs */}
        <div className="relative mt-3 h-7">
          {/* Tick marks min / max */}
          <span className="absolute left-0 top-0 text-[10px] font-bold tabular-nums text-muted-foreground">
            {min}
          </span>
          <span className="absolute right-0 top-0 text-[10px] font-bold tabular-nums text-muted-foreground">
            {max}
          </span>

          {/* Marqueurs compétitions IN-RANGE */}
          {competitions
            .filter((c) => c.weeks >= min && c.weeks <= max)
            .map(({ comp, weeks: w }) => (
              <span
                key={comp.id}
                className="absolute top-3.5 -translate-x-1/2"
                style={{ left: `${pct(w)}%` }}
                aria-hidden
              >
                <span
                  className={cn(
                    "block h-2.5 w-2.5 rounded-full ring-2 ring-background",
                    w === weeks
                      ? "bg-emerald-500"
                      : "bg-emerald-300 dark:bg-emerald-600",
                  )}
                />
              </span>
            ))}
        </div>
      </div>

      {/* Hint */}
      {competitions.some(
        (c) => c.weeks === weeks && c.weeks >= min && c.weeks <= max,
      ) && (
        <Badge
          variant="outline"
          className="mt-2 gap-1 border-emerald-300 bg-emerald-50 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <Target className="h-2.5 w-2.5" />
          Pic aligné sur une compétition
        </Badge>
      )}
    </div>
  );
}

interface WeekdayPickerProps {
  /** Jours cochés (0=Lun…6=Dim). */
  weekdays: number[];
  /** Coche/décoche un jour. */
  onToggle: (d: number) => void;
  /** Jours désignés amorce SNC parmi les jours cochés. */
  primerSet: Set<number>;
  /** Bascule le rôle d'un jour coché entre amorce et développement. */
  onTogglePrimer: (d: number) => void;
  /** Nb de jours d'amorce cochés — pilote la légende. */
  primerCount: number;
  /** Nb de jours de développement cochés — pilote la légende. */
  devCount: number;
  /** Sprint (50/100) sans jour de développement force → avertissement. */
  sprintNoDevDay: boolean;
}

/**
 * Rangée de 7 boutons jour (Lun…Dim). §307.
 *  - Jour d'amorce coché (Lun/Jeu) → ambre ; jour de dev coché → violet.
 *  - Légende des rôles présents + avertissement sprint sans jour de dev.
 */
function WeekdayPicker({
  weekdays,
  onToggle,
  primerSet,
  onTogglePrimer,
  primerCount,
  devCount,
  sprintNoDevDay,
}: WeekdayPickerProps) {
  const set = new Set(weekdays);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label, d) => {
          const selected = set.has(d);
          const primer = primerSet.has(d);
          return (
            <button
              key={d}
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={
                selected
                  ? primer ? `${label} — amorce SNC` : `${label} — développement`
                  : label
              }
              onClick={() => onToggle(d)}
              className={cn(
                "flex min-h-[48px] flex-col items-center justify-center rounded-xl border px-1 py-1.5 text-xs font-semibold transition-colors",
                selected && primer &&
                  "border-amber-500 bg-amber-500 text-white shadow-sm dark:border-amber-400 dark:bg-amber-400",
                selected && !primer &&
                  "border-violet-600 bg-violet-600 text-white shadow-sm dark:border-violet-500 dark:bg-violet-500",
                !selected &&
                  "border-border bg-card hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Rôle par séance — toggle amorce ↔ développement pour chaque jour coché. */}
      {weekdays.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
          <p className="text-[11px] font-medium text-muted-foreground">Rôle des séances</p>
          <div className="flex flex-col gap-1.5">
            {weekdays.map((d) => {
              const isP = primerSet.has(d);
              return (
                <div key={d} className="flex items-center gap-2.5">
                  <span className="w-7 shrink-0 text-xs font-semibold text-foreground">
                    {WEEKDAY_LABELS[d]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onTogglePrimer(d)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                      isP
                        ? "border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-400"
                        : "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500",
                    )}
                  >
                    {isP ? "Amorce SNC" : "Dév. force"}
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    {isP ? "volume réduit · potentiation" : "volume plein · progression"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Légende — uniquement les rôles présents. */}
      {(primerCount > 0 || devCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {primerCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 dark:bg-amber-400" />
              Amorce SNC
            </span>
          )}
          {devCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-600 dark:bg-violet-500" />
              Développement force
            </span>
          )}
        </div>
      )}

      {/* Avertissement : sprint avec uniquement des jours d'amorce. */}
      {sprintNoDevDay && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400" />
          <span>
            Aucun jour de développement force — coche un jour off-bassin
            (Mar/Mer/Ven) pour construire la force.
          </span>
        </div>
      )}
    </div>
  );
}

interface StartDatePickerProps {
  /** Date ISO (YYYY-MM-DD) ou "" si pas encore choisie. */
  value: string;
  /** Borne min (aujourd'hui ISO). */
  min: string;
  onChange: (iso: string) => void;
  /** `true` si la date ne tombe pas un lundi → 1re semaine partielle. */
  isPartialWeek: boolean;
}

/** Sélecteur de date de départ — input natif stylé + résolution lisible. §307. */
function StartDatePicker({
  value,
  min,
  onChange,
  isPartialWeek,
}: StartDatePickerProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="date"
          value={value}
          min={min}
          aria-label="Date de départ du mésocycle"
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-border bg-card pl-10 pr-3 text-sm font-semibold outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:focus:border-violet-400 dark:focus:ring-violet-900/50"
        />
      </div>
      {value !== "" && (
        <p className="text-[11px] text-muted-foreground">
          Démarre le{" "}
          <span className="font-semibold text-foreground">
            {fmtShortDate(value)}
          </span>
          .
        </p>
      )}
      {isPartialWeek && (
        <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
          1re semaine partielle — les jours avant cette date ne sont pas
          planifiés.
        </p>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-dvh bg-muted/30 pb-24">
      <div className="border-b bg-background px-4 py-3">
        <div className="mx-auto h-9 max-w-2xl animate-pulse rounded bg-muted" />
      </div>
      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

function AssessmentRequiredScreen({ onBack }: { onBack: () => void }) {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-dvh bg-muted/30">
      <Header onBack={onBack} />
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <Card className="border-violet-300 bg-violet-50 p-6 text-center dark:border-violet-800/60 dark:bg-violet-950/40">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-white dark:bg-violet-500">
            <Dumbbell className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-violet-900 dark:text-violet-100">
            Tu dois d'abord faire ton bilan muscu
          </h2>
          <p className="mx-auto mt-1.5 max-w-[320px] text-sm leading-relaxed text-violet-700 dark:text-violet-300">
            Le mésocycle se construit à partir de tes scores de bilan
            (force, puissance, mobilité, ressenti).
          </p>
          <Button
            type="button"
            onClick={() => navigate("/strength/questionnaire")}
            className="mt-5 bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
          >
            Aller au bilan
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </Card>
      </div>
    </div>
  );
}
