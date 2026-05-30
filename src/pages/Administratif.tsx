import * as React from "react";
import { Redirect, type RouteComponentProps } from "wouter";
import { endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  summarizeApiError,
  type TimesheetLocation,
  type TimesheetGroupLabel,
  listTimesheetShifts,
  listTimesheetLocations,
  listPermanentGroupsForTimesheet,
  listTimesheetGroupLabels,
  getCapabilities,
  createTimesheetShift,
  updateTimesheetShift,
  deleteTimesheetShift,
  createTimesheetLocation,
  deleteTimesheetLocation,
  createTimesheetGroupLabel,
  deleteTimesheetGroupLabel,
} from "@/lib/api";
import { supabaseConfig } from "@/lib/config";
import { tryWithOfflineQueue, isOfflineQueuedResult } from "@/lib/offlineQueue";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TimesheetShiftForm } from "@/components/timesheet/TimesheetShiftForm";
import { TimesheetShiftList, type TimesheetShiftGroup } from "@/components/timesheet/TimesheetShiftList";
import {
  calculateTimesheetTotals,
  formatMinutes,
  getShiftDurationMinutes,
  type TimesheetShift,
} from "@/pages/timesheetHelpers";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Briefcase, Car, Clock, MapPin, Plus, TrendingDown, TrendingUp } from "lucide-react";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

type TimesheetTab = "POINTAGE" | "DASHBOARD";
type DashboardPeriod = "7d" | "month" | "prevMonth" | "custom";

interface AdministratifProps extends RouteComponentProps {
  initialTab?: TimesheetTab;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WORK_COLOR = "hsl(var(--primary))";
const TRAVEL_COLOR = "hsl(var(--chart-2))";

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  "7d": "7 jours",
  month: "Ce mois",
  prevMonth: "Mois préc.",
  custom: "Dates",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const buildTimeLabel = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "HH:mm");
};

const buildShiftDateKey = (shift: TimesheetShift) => shift.shift_date;

const withinRangeYMD = (value: string, from: string, to: string) => {
  const valueTime = new Date(value).getTime();
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  return valueTime >= Math.min(fromTime, toTime) && valueTime <= Math.max(fromTime, toTime);
};

const resolveDefaultLocation = (items: TimesheetLocation[]) =>
  items.find((item) => item.name === "Piscine")?.name ?? items[0]?.name ?? "Piscine";

const computePeriodDates = (period: DashboardPeriod, now = new Date()): [string, string] => {
  switch (period) {
    case "7d":
      return [format(subDays(now, 6), "yyyy-MM-dd"), format(now, "yyyy-MM-dd")];
    case "month":
      return [format(startOfMonth(now), "yyyy-MM-dd"), format(now, "yyyy-MM-dd")];
    case "prevMonth": {
      const prev = subMonths(now, 1);
      return [format(startOfMonth(prev), "yyyy-MM-dd"), format(endOfMonth(prev), "yyyy-MM-dd")];
    }
    default:
      return [format(startOfMonth(now), "yyyy-MM-dd"), format(now, "yyyy-MM-dd")];
  }
};

// ─── Animation Variants ──────────────────────────────────────────────────────

const stagger = { visible: { transition: { staggerChildren: 0.06 } } };
const cardReveal = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" as const } },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Administratif({ initialTab = "POINTAGE" }: AdministratifProps) {
  const { useMemo, useState } = React;
  const reduce = useReducedMotion();
  const staggerVariants = reduce ? {} : stagger;
  const cardVariants = reduce ? {} : cardReveal;
  const queryClient = useQueryClient();
  // §350 — Garde SSR/test (cf. Admin.tsx) : condition constante par
  // environnement → ordre des hooks stable, pas de #310 réel.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const role = typeof window === "undefined" ? useAuth.getState().role : useAuth((s) => s.role);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const userId = typeof window === "undefined" ? useAuth.getState().userId : useAuth((s) => s.userId);
  const isCoach = role === "coach" || role === "admin";

  // ─── Tab state ──
  const [activeTab, setActiveTab] = useState<TimesheetTab>(initialTab);

  // ─── Form state ──
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("Piscine");
  const [isTravel, setIsTravel] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(true);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [isLocationPanelOpen, setIsLocationPanelOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [selectedGroupNames, setSelectedGroupNames] = useState<string[]>([]);

  // ─── Dashboard state ──
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>("month");
  const [dashboardFrom, setDashboardFrom] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [dashboardTo, setDashboardTo] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // ─── Queries ──
  const { data: shifts = [], error: shiftsError } = useQuery({
    queryKey: ["timesheet-shifts", userId],
    queryFn: () => listTimesheetShifts({ coachId: userId ?? undefined }),
    enabled: isCoach,
  });

  const { data: locations = [], error: locationsError } = useQuery<TimesheetLocation[]>({
    queryKey: ["timesheet-locations"],
    queryFn: () => listTimesheetLocations(),
    enabled: isCoach,
  });

  const { data: permanentGroups = [] } = useQuery({
    queryKey: ["timesheet-permanent-groups"],
    queryFn: () => listPermanentGroupsForTimesheet(),
    enabled: isCoach,
  });

  const { data: customGroupLabels = [] } = useQuery<TimesheetGroupLabel[]>({
    queryKey: ["timesheet-group-labels"],
    queryFn: () => listTimesheetGroupLabels(),
    enabled: isCoach,
  });

  const { data: capabilities, error: capabilitiesError } = useQuery({
    queryKey: ["capabilities", "timesheet"],
    queryFn: () => getCapabilities(),
    enabled: supabaseConfig.hasSupabase,
  });

  const defaultLocation = useMemo(() => resolveDefaultLocation(locations), [locations]);

  // ─── Mutations ──
  const resetForm = React.useCallback(() => {
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStartTime("");
    setEndTime("");
    setLocation(defaultLocation);
    setIsTravel(false);
    setSelectedGroupNames([]);
  }, [defaultLocation]);

  const createShift = useMutation({
    mutationFn: (payload: Omit<TimesheetShift, "id" | "coach_name">) =>
      tryWithOfflineQueue(
        "create-shift",
        payload as unknown as Record<string, unknown>,
        () => createTimesheetShift(payload),
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-shifts"] });
      resetForm();
      toast(isOfflineQueuedResult(result) ? "Shift en attente" : "Shift enregistré", { description: "Sera synchronisé au retour en ligne." });
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: summarizeApiError(error, "Impossible d'enregistrer le shift.").message });
    },
  });

  const updateShift = useMutation({
    mutationFn: (payload: Partial<TimesheetShift> & { id: number }) =>
      tryWithOfflineQueue(
        "update-shift",
        payload as unknown as Record<string, unknown>,
        () => updateTimesheetShift(payload),
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-shifts"] });
      setIsSheetOpen(false);
      setEditingShiftId(null);
      resetForm();
      toast(isOfflineQueuedResult(result) ? "Mise à jour en attente" : "Shift mis à jour", { description: "Sera synchronisée au retour en ligne." });
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: summarizeApiError(error, "Impossible de modifier le shift.").message });
    },
  });

  const deleteShift = useMutation({
    mutationFn: (payload: { id: number }) =>
      tryWithOfflineQueue(
        "delete-shift",
        payload as Record<string, unknown>,
        () => deleteTimesheetShift(payload),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-shifts"] });
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: summarizeApiError(error, "Impossible de supprimer le shift.").message });
    },
  });

  const createLocation = useMutation({
    mutationFn: (payload: { name: string }) =>
      tryWithOfflineQueue(
        "create-location",
        payload as Record<string, unknown>,
        () => createTimesheetLocation(payload),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-locations"] });
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: summarizeApiError(error, "Impossible d'ajouter le lieu.").message });
    },
  });

  const deleteLocation = useMutation({
    mutationFn: (payload: { id: number }) =>
      tryWithOfflineQueue(
        "delete-location",
        payload as Record<string, unknown>,
        () => deleteTimesheetLocation(payload),
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-locations"] });
      const remaining = locations.filter((item) => item.id !== variables.id);
      if (location && remaining.every((item) => item.name !== location)) {
        setLocation(resolveDefaultLocation(remaining));
      }
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: summarizeApiError(error, "Impossible de supprimer le lieu.").message });
    },
  });

  const createGroupLabel = useMutation({
    mutationFn: (payload: { name: string }) => createTimesheetGroupLabel(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-group-labels"] });
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: summarizeApiError(error, "Impossible d'ajouter le groupe.").message });
    },
  });

  const deleteGroupLabel = useMutation({
    mutationFn: (payload: { id: number }) => deleteTimesheetGroupLabel(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-group-labels"] });
    },
    onError: (error: unknown) => {
      toast("Erreur", { description: summarizeApiError(error, "Impossible de supprimer le groupe.").message });
    },
  });

  // ─── Pointage computed values ──
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const todayMinutes = useMemo(
    () =>
      shifts.reduce((acc, shift) => {
        if (buildShiftDateKey(shift) !== todayKey) return acc;
        const duration = getShiftDurationMinutes(shift);
        return duration ? acc + duration : acc;
      }, 0),
    [shifts, todayKey],
  );

  const ongoingCount = useMemo(
    () => shifts.filter((s) => buildShiftDateKey(s) === todayKey && !s.end_time).length,
    [shifts, todayKey],
  );

  const weekMonthTotals = useMemo(() => calculateTimesheetTotals(shifts), [shifts]);

  const grouped = useMemo<TimesheetShiftGroup[]>(() => {
    const sorted = [...shifts].sort((a, b) => (a.start_time < b.start_time ? 1 : -1));
    const map = new Map<string, TimesheetShift[]>();
    sorted.forEach((shift) => {
      const key = buildShiftDateKey(shift);
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(shift);
    });
    return Array.from(map.entries())
      .map(([groupDate, items]) => {
        const totalMinutes = items.reduce((acc, shift) => {
          const duration = getShiftDurationMinutes(shift);
          return duration ? acc + duration : acc;
        }, 0);
        return { date: groupDate, shifts: items, totalMinutes };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [shifts]);

  // ─── Dashboard computed values ──
  const dashboardShiftsInRange = useMemo(
    () => shifts.filter((s) => withinRangeYMD(buildShiftDateKey(s), dashboardFrom, dashboardTo)),
    [shifts, dashboardFrom, dashboardTo],
  );

  const dashboardTotals = useMemo(
    () =>
      dashboardShiftsInRange.reduce(
        (acc, shift) => {
          const duration = getShiftDurationMinutes(shift) ?? 0;
          if (shift.is_travel) acc.travel += duration;
          else acc.work += duration;
          acc.total += duration;
          return acc;
        },
        { count: dashboardShiftsInRange.length, work: 0, travel: 0, total: 0 },
      ),
    [dashboardShiftsInRange],
  );

  const dashboardUniqueDays = useMemo(
    () => new Set(dashboardShiftsInRange.map((s) => buildShiftDateKey(s))).size,
    [dashboardShiftsInRange],
  );

  const avgMinutesPerDay = dashboardUniqueDays > 0 ? dashboardTotals.total / dashboardUniqueDays : 0;

  const periodComparison = useMemo(() => {
    const fromDate = new Date(dashboardFrom);
    const toDate = new Date(dashboardTo);
    const periodMs = toDate.getTime() - fromDate.getTime();
    const prevTo = new Date(fromDate.getTime() - 86400000);
    const prevFrom = new Date(prevTo.getTime() - periodMs);
    const prevFromStr = format(prevFrom, "yyyy-MM-dd");
    const prevToStr = format(prevTo, "yyyy-MM-dd");
    const prevShifts = shifts.filter((s) => withinRangeYMD(buildShiftDateKey(s), prevFromStr, prevToStr));
    const prevTotal = prevShifts.reduce((acc, s) => acc + (getShiftDurationMinutes(s) ?? 0), 0);
    const delta = dashboardTotals.total - prevTotal;
    const percent = prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : 0;
    return { prevTotal, delta, percent };
  }, [dashboardFrom, dashboardTo, dashboardTotals.total, shifts]);

  const showComparison = periodComparison.prevTotal > 0 && periodComparison.delta !== 0;

  const pieData = useMemo(
    () =>
      [
        { name: "Travail", value: dashboardTotals.work, fill: WORK_COLOR },
        { name: "Trajet", value: dashboardTotals.travel, fill: TRAVEL_COLOR },
      ].filter((d) => d.value > 0),
    [dashboardTotals],
  );

  const dashboardHistogram = useMemo(() => {
    const buckets = new Map<string, { work: number; travel: number }>();
    dashboardShiftsInRange.forEach((shift) => {
      const key = buildShiftDateKey(shift);
      const minutes = getShiftDurationMinutes(shift) ?? 0;
      const bucket = buckets.get(key) ?? { work: 0, travel: 0 };
      if (shift.is_travel) bucket.travel += minutes;
      else bucket.work += minutes;
      buckets.set(key, bucket);
    });
    return Array.from(buckets.entries())
      .map(([dateKey, { work, travel }]) => ({
        date: dateKey,
        label: format(new Date(dateKey), "dd/MM"),
        work: Number((work / 60).toFixed(2)),
        travel: Number((travel / 60).toFixed(2)),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [dashboardShiftsInRange]);

  const topLocations = useMemo(() => {
    const map = new Map<string, number>();
    dashboardShiftsInRange.forEach((s) => {
      const loc = s.location || "Non précisé";
      map.set(loc, (map.get(loc) ?? 0) + (getShiftDurationMinutes(s) ?? 0));
    });
    const sorted = Array.from(map.entries())
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
    const max = sorted[0]?.minutes ?? 0;
    return sorted.map((item) => ({ ...item, percent: max > 0 ? (item.minutes / max) * 100 : 0 }));
  }, [dashboardShiftsInRange]);

  const formatLongDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });

  // ─── Form helpers ──
  const durationLabel = useMemo(() => {
    if (!startTime || !endTime) return null;
    const startIso = new Date(`${date}T${startTime}`);
    const endIso = new Date(`${date}T${endTime}`);
    if (Number.isNaN(startIso.getTime()) || Number.isNaN(endIso.getTime())) return null;
    const diffMinutes = (endIso.getTime() - startIso.getTime()) / 60000;
    return diffMinutes > 0 ? formatMinutes(diffMinutes) : null;
  }, [date, startTime, endTime]);

  const isSaving = createShift.isPending || updateShift.isPending;
  const isManagingLocations = createLocation.isPending || deleteLocation.isPending;

  // ─── Event handlers ──
  const handlePeriodChange = (period: DashboardPeriod) => {
    setDashboardPeriod(period);
    if (period !== "custom") {
      const [from, to] = computePeriodDates(period);
      setDashboardFrom(from);
      setDashboardTo(to);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!date || !startTime) {
      toast("Champs requis", { description: "Date et heure de début obligatoires." });
      return;
    }
    if (endTime && endTime <= startTime) {
      toast("Heures invalides", { description: "La fin doit être après le début." });
      return;
    }
    if (!userId) {
      toast("Utilisateur manquant");
      return;
    }
    if (editingShiftId) {
      updateShift.mutate({
        id: editingShiftId,
        coach_id: userId,
        shift_date: date,
        start_time: startTime,
        end_time: endTime || null,
        location: location.trim() || null,
        is_travel: isTravel,
        group_names: selectedGroupNames,
      });
    } else {
      createShift.mutate({
        coach_id: userId,
        shift_date: date,
        start_time: startTime,
        end_time: endTime || null,
        location: location.trim() || null,
        is_travel: isTravel,
        group_names: selectedGroupNames,
      });
    }
  };

  const openNewShift = () => {
    resetForm();
    setEditingShiftId(null);
    setIsSheetOpen(true);
  };

  const openEditShift = (shift: TimesheetShift) => {
    setEditingShiftId(shift.id);
    setDate(buildShiftDateKey(shift));
    setStartTime(buildTimeLabel(shift.start_time));
    setEndTime(shift.end_time ? buildTimeLabel(shift.end_time) : "");
    setLocation(shift.location ?? "");
    setIsTravel(shift.is_travel);
    setSelectedGroupNames(shift.group_names ?? []);
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setEditingShiftId(null);
  };

  const handleAddLocation = () => {
    const trimmed = newLocationName.trim();
    if (!trimmed) return;
    createLocation.mutate({ name: trimmed });
    setNewLocationName("");
  };

  // ─── Effects ──
  React.useEffect(() => {
    if (activeTab === "DASHBOARD") {
      setIsSheetOpen(false);
      setEditingShiftId(null);
    }
  }, [activeTab]);

  React.useEffect(() => {
    if (!isSheetOpen || editingShiftId) return;
    if (!location || locations.every((item) => item.name !== location)) {
      setLocation(defaultLocation);
    }
  }, [defaultLocation, editingShiftId, isSheetOpen, location, locations]);

  // ─── Auth guard ──
  if (!isCoach) {
    if (typeof window === "undefined") return null;
    return <Redirect to="/" />;
  }

  const capabilityMessage = capabilitiesError
    ? summarizeApiError(capabilitiesError, "Impossible de vérifier le module de pointage.").message
    : capabilities?.mode === "supabase" && !capabilities.timesheet.available
      ? "Pointage heures indisponible (tables manquantes côté D1)."
      : null;
  const shiftsErrorMessage = shiftsError
    ? summarizeApiError(shiftsError, "Impossible de charger les shifts.").message
    : null;
  const locationsErrorMessage = locationsError
    ? summarizeApiError(locationsError, "Impossible de charger les lieux.").message
    : null;

  // ─── Render ──
  return (
    <div className="min-h-screen bg-background pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Administratif</h1>
          <div role="tablist" aria-label="Sections administratives" className="flex items-center gap-1 rounded-full border border-border bg-card p-1 text-xs font-extrabold">
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === "POINTAGE"}
              aria-controls="tab-panel-pointage"
              id="tab-pointage"
              className={`rounded-full px-3 py-2 transition-colors ${activeTab === "POINTAGE" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
              onClick={() => setActiveTab("POINTAGE")}
            >
              Pointage
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={activeTab === "DASHBOARD"}
              aria-controls="tab-panel-dashboard"
              id="tab-dashboard"
              className={`rounded-full px-3 py-2 transition-colors ${activeTab === "DASHBOARD" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
              onClick={() => setActiveTab("DASHBOARD")}
            >
              Dashboard
            </button>
          </div>
        </div>

        {/* Error banners */}
        {capabilityMessage ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {capabilityMessage}
          </div>
        ) : null}
        {shiftsErrorMessage ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {shiftsErrorMessage}
          </div>
        ) : null}
        {locationsErrorMessage ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {locationsErrorMessage}
          </div>
        ) : null}

        {/* ═══════════════════ POINTAGE TAB ═══════════════════ */}
        {activeTab === "POINTAGE" ? (
          <motion.div
            key="pointage"
            role="tabpanel"
            id="tab-panel-pointage"
            aria-labelledby="tab-pointage"
            initial="hidden"
            animate="visible"
            variants={staggerVariants}
            className="flex flex-col gap-4"
          >
            {/* Today's Hours Hero */}
            <motion.div variants={cardVariants} className="rounded-xl border bg-card p-4">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>Heures aujourd'hui</span>
              </div>
              <div className="mt-1 text-3xl font-bold tabular-nums text-foreground">
                {formatMinutes(todayMinutes)}
              </div>
              {ongoingCount > 0 ? (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
                  {ongoingCount} shift{ongoingCount > 1 ? "s" : ""} en cours
                </div>
              ) : null}
            </motion.div>

            {/* Week / Month Summary */}
            <motion.div variants={cardVariants} className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/30 p-3">
                <span className="text-[11px] text-muted-foreground">Semaine</span>
                <div className="text-lg font-bold tabular-nums">
                  {formatMinutes(weekMonthTotals.week.totalMinutes)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatMinutes(weekMonthTotals.week.workMinutes)} trav. · {formatMinutes(weekMonthTotals.week.travelMinutes)} trajet
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <span className="text-[11px] text-muted-foreground">Mois</span>
                <div className="text-lg font-bold tabular-nums">
                  {formatMinutes(weekMonthTotals.month.totalMinutes)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatMinutes(weekMonthTotals.month.workMinutes)} trav. · {formatMinutes(weekMonthTotals.month.travelMinutes)} trajet
                </div>
              </div>
            </motion.div>

            {/* Locations Panel */}
            <motion.div variants={cardVariants} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Lieux
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setIsLocationPanelOpen((v) => !v)}
                >
                  Gérer
                </Button>
              </div>
              {isLocationPanelOpen ? (
                <div className="mt-3 space-y-3 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-2">
                    {locations.length ? (
                      locations.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-semibold text-foreground"
                        >
                          <span>{item.name}</span>
                          <button
                            type="button"
                            className="text-muted-foreground transition hover:text-foreground"
                            onClick={() => deleteLocation.mutate({ id: item.id })}
                            aria-label={`Supprimer ${item.name}`}
                            disabled={isManagingLocations}
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Aucun lieu enregistré.</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={newLocationName}
                      onChange={(event) => setNewLocationName(event.target.value)}
                      placeholder="Nouveau lieu"
                      className="min-w-[160px] flex-1 h-9"
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="h-9"
                      onClick={handleAddLocation}
                      disabled={!newLocationName.trim() || isManagingLocations}
                    >
                      Ajouter
                    </Button>
                  </div>
                </div>
              ) : null}
            </motion.div>

            {/* Shift List */}
            <motion.div variants={cardVariants}>
              <TimesheetShiftList
                groups={grouped}
                onEdit={openEditShift}
                onDelete={(id) => deleteShift.mutate({ id })}
              />
            </motion.div>

            {/* FAB */}
            <TooltipProvider>
              <ShadcnTooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="fixed bottom-4 right-4 z-fab flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_20px_-2px_hsl(var(--primary)/0.25)] hover:bg-primary/90 transition-colors"
                    onClick={openNewShift}
                    aria-label="Nouveau shift"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Nouveau shift</TooltipContent>
              </ShadcnTooltip>
            </TooltipProvider>
          </motion.div>
        ) : null}

        {/* ═══════════════════ DASHBOARD TAB ═══════════════════ */}
        {activeTab === "DASHBOARD" ? (
          <motion.div
            key="dashboard"
            role="tabpanel"
            id="tab-panel-dashboard"
            aria-labelledby="tab-dashboard"
            initial="hidden"
            animate="visible"
            variants={staggerVariants}
            className="flex flex-col gap-4"
          >
            {/* Period Selector */}
            <motion.div variants={cardVariants} className="rounded-xl border bg-card p-4">
              <h2 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground mb-3">
                Période
              </h2>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={dashboardPeriod}
                onValueChange={(v) => {
                  if (v) handlePeriodChange(v as DashboardPeriod);
                }}
                className="flex flex-wrap gap-1"
              >
                {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((key) => (
                  <ToggleGroupItem key={key} value={key} className="h-8 px-3 text-xs" aria-label={PERIOD_LABELS[key]}>
                    {PERIOD_LABELS[key]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {dashboardPeriod === "custom" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="min-w-[140px] flex-1 space-y-1">
                    <Label htmlFor="db-from" className="text-[11px]">
                      Du
                    </Label>
                    <Input
                      id="db-from"
                      type="date"
                      value={dashboardFrom}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDashboardFrom(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="min-w-[140px] flex-1 space-y-1">
                    <Label htmlFor="db-to" className="text-[11px]">
                      Au
                    </Label>
                    <Input
                      id="db-to"
                      type="date"
                      value={dashboardTo}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDashboardTo(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {formatLongDate.format(new Date(dashboardFrom))} → {formatLongDate.format(new Date(dashboardTo))}
                </div>
              )}
            </motion.div>

            {/* Hero KPI */}
            <motion.div variants={cardVariants} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] text-muted-foreground">Total période</span>
                  <div className="text-4xl font-bold tabular-nums">{formatMinutes(dashboardTotals.total)}</div>
                </div>
                {showComparison ? (
                  <div
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                      periodComparison.delta > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {periodComparison.delta > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {periodComparison.delta > 0 ? "+" : ""}
                    {periodComparison.percent}%
                  </div>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {dashboardTotals.count} shift{dashboardTotals.count !== 1 ? "s" : ""}
                {dashboardUniqueDays > 0 ? ` · Moy. ${formatMinutes(avgMinutesPerDay)}/jour` : ""}
                {showComparison
                  ? ` · vs ${formatMinutes(periodComparison.prevTotal)} période préc.`
                  : ""}
              </div>
            </motion.div>

            {/* Work / Travel Cards */}
            <motion.div variants={cardVariants} className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Briefcase className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] text-muted-foreground">Travail</span>
                </div>
                <div className="text-xl font-bold tabular-nums">{formatMinutes(dashboardTotals.work)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {dashboardTotals.total > 0
                    ? `${Math.round((dashboardTotals.work / dashboardTotals.total) * 100)}%`
                    : "–"}
                </div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Car className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">Trajet</span>
                </div>
                <div className="text-xl font-bold tabular-nums">{formatMinutes(dashboardTotals.travel)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {dashboardTotals.total > 0
                    ? `${Math.round((dashboardTotals.travel / dashboardTotals.total) * 100)}%`
                    : "–"}
                </div>
              </div>
            </motion.div>

            {/* Donut Chart — Work vs Travel */}
            {pieData.length > 0 ? (
              <motion.div variants={cardVariants} className="rounded-xl border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground mb-3">
                  Répartition
                </h3>
                <div className="flex items-center gap-6">
                  <div className="relative shrink-0">
                    <PieChart width={140} height={140}>
                      <Pie
                        data={pieData}
                        cx={70}
                        cy={70}
                        innerRadius={42}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-sm font-bold tabular-nums">{formatMinutes(dashboardTotals.total)}</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    {pieData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: entry.fill }} />
                        <span className="text-sm text-foreground">{entry.name}</span>
                        <span className="ml-auto text-sm font-semibold tabular-nums">
                          {formatMinutes(entry.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : null}

            {/* Stacked Bar Chart — Hours per Day */}
            <motion.div variants={cardVariants} className="rounded-xl border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground mb-3">
                Heures par jour
              </h3>
              {dashboardHistogram.length > 0 ? (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboardHistogram} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}h`} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${value.toFixed(1)}h`,
                          name === "work" ? "Travail" : "Trajet",
                        ]}
                        labelFormatter={(label) => `${label}`}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(var(--border))",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="work" name="Travail" stackId="hours" fill={WORK_COLOR} />
                      <Bar dataKey="travel" name="Trajet" stackId="hours" fill={TRAVEL_COLOR} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">Aucune donnée sur la période.</p>
              )}
            </motion.div>

            {/* Top Locations */}
            {topLocations.length > 0 ? (
              <motion.div variants={cardVariants} className="rounded-xl border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground mb-3">
                  Top lieux
                </h3>
                <div className="space-y-3">
                  {topLocations.map((loc) => (
                    <div key={loc.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{loc.name}</span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{formatMinutes(loc.minutes)}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${loc.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </motion.div>
        ) : null}
      </div>

      {/* Shift Form Bottom Sheet */}
      {activeTab === "POINTAGE" ? (
        <TimesheetShiftForm
          isOpen={isSheetOpen}
          isEditing={Boolean(editingShiftId)}
          isSaving={isSaving}
          date={date}
          startTime={startTime}
          endTime={endTime}
          location={location}
          isTravel={isTravel}
          durationLabel={durationLabel}
          locations={locations}
          onClose={closeSheet}
          onSubmit={handleSubmit}
          onDateChange={setDate}
          onStartTimeChange={setStartTime}
          onEndTimeChange={setEndTime}
          onLocationChange={setLocation}
          onTravelChange={setIsTravel}
          onCreateLocation={(name) => createLocation.mutate({ name })}
          onDeleteLocation={(id) => deleteLocation.mutate({ id })}
          permanentGroups={permanentGroups}
          customGroupLabels={customGroupLabels}
          selectedGroupNames={selectedGroupNames}
          onGroupToggle={(name) => {
            setSelectedGroupNames((prev) =>
              prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
            );
          }}
          onCreateGroupLabel={(name) => createGroupLabel.mutate({ name })}
          onDeleteGroupLabel={(id) => deleteGroupLabel.mutate({ id })}
        />
      ) : null}
    </div>
  );
}
