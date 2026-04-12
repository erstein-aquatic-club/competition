import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { X, Waves, Power, Check, Circle, UserX, FileText, UserCheck, Minus, Plus, Sun, Moon, ChevronDown, Trash2, MessageCircle, Clock, ChevronRight, PenLine } from "lucide-react";
import { useLocation } from "wouter";
import { BottomActionBar, type SaveState } from "@/components/shared/BottomActionBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { slideInFromBottom, staggerChildren, listItem } from "@/lib/animations";
import { durationsSeconds } from "@/lib/design-tokens";
import { StrokeDetailForm } from "./StrokeDetailForm";
import type { Session, SwimExerciseLogInput } from "@/lib/api";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function dayLabelFR(d: Date) {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtKm(km: number | string | null | undefined) {
  const n = Number(km);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const str = String(rounded);
  return str.endsWith(".0") ? str.slice(0, -2) : str;
}

function metersToKm(m: number | string | null | undefined) {
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 1000) * 100) / 100;
}

function kmToMeters(km: number | string | null | undefined) {
  const n = Number(km);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000);
}

type SlotKey = "AM" | "PM";

type PlannedSession = {
  id: string;
  iso: string;
  slotKey: SlotKey;
  title: string;
  km: number | null;
  details: string[];
  assignmentId?: number;
  isEmpty: boolean;
  slotTime?: string;
  slotLocation?: string;
  assignmentSource?: 'individual' | 'subgroup' | 'group' | 'none';
  alternatives?: Array<{
    assignmentId: number;
    title: string;
    km: number | null;
    subgroupName?: string;
  }>;
  swimmerSlotId?: string;
};

type StrokeDraft = { NL: string; DOS: string; BR: string; PAP: string; QN: string };

type IndicatorKey = "difficulty" | "fatigue_end" | "performance" | "engagement";

type DraftState = Record<IndicatorKey, number | null> & {
  comment: string;
  distanceMeters: number | null;
  showStrokeDetail: boolean;
  strokes: StrokeDraft;
  exerciseLogs: SwimExerciseLogInput[];
};

const INDICATORS = [
  { key: "difficulty" as const, label: "Difficulté", mode: "hard" as const },
  { key: "fatigue_end" as const, label: "Fatigue fin", mode: "hard" as const },
  { key: "performance" as const, label: "Perf perçue", mode: "good" as const },
  { key: "engagement" as const, label: "Engagement", mode: "good" as const },
];

const SLOTS = [
  { key: "AM" as const, label: "Matin", Icon: Sun },
  { key: "PM" as const, label: "Soir", Icon: Moon },
];

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

function AlternativesSection({
  alternatives,
  onSelect,
}: {
  alternatives: NonNullable<PlannedSession['alternatives']>;
  onSelect?: (assignmentId: number, title: string, km: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(alternatives.length <= 3);
  return (
    <div className="mt-1 ml-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        Autres séances disponibles ({alternatives.length})
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-1 pl-4">
              {alternatives.map((alt) => (
                <div
                  key={alt.assignmentId}
                  className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{alt.title}</p>
                    {alt.subgroupName && (
                      <p className="text-[10px] text-muted-foreground">{alt.subgroupName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {alt.km != null && (
                      <span className="text-[10px] text-muted-foreground">{fmtKm(alt.km)} km</span>
                    )}
                    {onSelect && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(alt.assignmentId, alt.title, alt.km);
                        }}
                        className="rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                      >
                        Choisir
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface IconButtonProps {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  children: React.ReactNode;
  tone?: "neutral" | "dark" | "sky";
  disabled?: boolean;
}

function IconButton({ onClick, label, children, tone = "neutral", disabled }: IconButtonProps) {
  const tones = {
    neutral: "bg-background border-border text-foreground hover:bg-muted",
    dark: "bg-foreground border-foreground text-background hover:opacity-90",
    sky: "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl border p-2 transition",
        tones[tone],
        disabled && "opacity-50 cursor-not-allowed hover:bg-background"
      )}
      aria-label={label}
      title={label}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function valueTone(mode: "hard" | "good", value: number) {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 1 || v > 5) return "neutral";

  const hardMap: Record<number, string> = {
    1: "bg-intensity-1 border-intensity-1 text-white",
    2: "bg-intensity-2 border-intensity-2 text-white",
    3: "bg-intensity-3 border-intensity-3 text-white",
    4: "bg-intensity-4 border-intensity-4 text-white",
    5: "bg-intensity-5 border-intensity-5 text-white",
  };
  const goodMap: Record<number, string> = {
    1: "bg-intensity-5 border-intensity-5 text-white",
    2: "bg-intensity-4 border-intensity-4 text-white",
    3: "bg-intensity-3 border-intensity-3 text-white",
    4: "bg-intensity-2 border-intensity-2 text-white",
    5: "bg-intensity-1 border-intensity-1 text-white",
  };

  return mode === "hard" ? hardMap[v] : goodMap[v];
}

interface DistanceStepperProps {
  plannedMeters: number;
  valueMeters: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function DistanceStepper({ plannedMeters, valueMeters, onChange, disabled }: DistanceStepperProps) {
  const step = 100;
  const min = 0;
  const max = 30000;

  const displayMeters = Number.isFinite(Number(valueMeters)) ? Number(valueMeters) : plannedMeters;
  const delta = displayMeters - plannedMeters;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  return (
    <div className={cn("mt-4 rounded-3xl border px-4 py-3", disabled ? "bg-muted border-border" : "bg-card border-border")}>
      <div className="flex items-center justify-between mb-2">
        <div className={cn("text-xs font-semibold", disabled ? "text-muted-foreground" : "text-foreground")}>Ajuster kilométrage</div>
        {delta !== 0 && (
          <div className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            delta > 0
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
          )}>
            {delta > 0 ? `+${delta}m` : `${delta}m`}
          </div>
        )}
      </div>

      {/* Planned value reference */}
      <div className="text-center mb-3">
        <div className={cn("text-xs", disabled ? "text-muted-foreground" : "text-muted-foreground")}>
          Planifié : {plannedMeters}m ({fmtKm(metersToKm(plannedMeters))} km)
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={disabled || displayMeters - step < min}
          onClick={() => onChange(displayMeters - step)}
          className={cn(
            "h-11 w-11 rounded-2xl border flex items-center justify-center transition-colors",
            disabled
              ? "bg-muted border-border text-muted-foreground cursor-not-allowed"
              : "bg-card border-border text-foreground hover:bg-muted active:scale-95"
          )}
          aria-label="-100m"
        >
          <Minus className="h-5 w-5" />
        </button>

        <div className="min-w-[140px] text-center">
          {editing ? (
            <>
              <input
                type="number"
                step={100}
                min={min}
                max={max}
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  const parsed = Number(editValue);
                  if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
                    onChange(Math.round(parsed / 100) * 100);
                  }
                  setEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === "Escape") {
                    setEditing(false);
                  }
                }}
                className="w-20 text-center text-lg font-bold bg-transparent border-b border-primary outline-none"
              />
              <div className="text-xs text-muted-foreground mt-0.5">mètres</div>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setEditValue(String(displayMeters));
                  setEditing(true);
                }}
                className={cn(
                  "text-2xl font-bold border-b border-dashed border-muted-foreground/40",
                  disabled ? "text-muted-foreground cursor-not-allowed" : "text-foreground hover:border-primary cursor-text"
                )}
              >
                {displayMeters}m
              </button>
              <div className={cn("text-sm font-medium mt-0.5", disabled ? "text-muted-foreground" : "text-primary")}>
                {fmtKm(metersToKm(displayMeters))} km
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          disabled={disabled || displayMeters + step > max}
          onClick={() => onChange(displayMeters + step)}
          className={cn(
            "h-11 w-11 rounded-2xl border flex items-center justify-center transition-colors",
            disabled
              ? "bg-muted border-border text-muted-foreground cursor-not-allowed"
              : "bg-card border-border text-foreground hover:bg-muted active:scale-95"
          )}
          aria-label="+100m"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

interface SessionStatus {
  status: "present" | "absent" | "not_expected";
  expected: boolean;
  expectedByDefault: boolean;
}

function AbsenceInlineButton({ onMark }: { onMark: (reason?: string) => void }) {
  const [showInput, setShowInput] = useState(false);
  const [reason, setReason] = useState("");
  if (!showInput) {
    return (
      <button
        type="button"
        className="w-full rounded-xl border border-dashed border-muted-foreground/30 p-2.5 mb-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setShowInput(true)}
      >
        Marquer indisponible
      </button>
    );
  }
  return (
    <div className="flex gap-2 mb-3">
      <input
        type="text"
        placeholder="Motif (optionnel)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
        autoFocus
      />
      <button
        type="button"
        onClick={() => { onMark(reason || undefined); setShowInput(false); setReason(""); }}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
      >
        OK
      </button>
    </div>
  );
}

interface FeedbackDrawerProps {
  open: boolean;
  selectedDate: Date;
  sessionsForSelectedDay: PlannedSession[];
  otherGroupAssignments?: Array<{ id: number; title: string; description: string; assigned_date: string; assigned_slot?: string | null; km?: number | null }>;
  selectedDayStatus: { completed: number; total: number };
  dayKm: string;
  activeSessionId: string | null;
  detailsOpen: boolean;
  draftState: DraftState;
  saveState: SaveState;
  isPending: boolean;
  logsBySessionId: Record<string, Session>;
  getLogForSession?: (sessionId: string) => Session | undefined;
  onClose: () => void;
  onDayOffAll: () => void;
  onOpenSession: (sessionId: string) => void;
  onCloseSession: () => void;
  onToggleDetails: () => void;
  onMarkAbsent: (sessionId: string) => void;
  onMarkPresent: (sessionId: string) => void;
  onClearOverride: (sessionId: string) => void;
  onSaveFeedback: () => void;
  onDraftStateChange: (state: DraftState) => void;
  getSessionStatus: (session: PlannedSession, date: Date) => SessionStatus;
  isAbsent?: boolean;
  absenceReason?: string | null;
  onDeleteFeedback?: (sessionId: string) => void;
  onMarkDayAbsent?: (reason?: string) => void;
  onRemoveDayAbsence?: () => void;
  onSwitchAlternative?: (sessionId: string, assignmentId: number, title: string, km: number | null) => void;
  /** When set, shows a banner indicating the swimmer switched to an alternative session */
  alternativeOverrideTitle?: string | null;
}

export function FeedbackDrawer({
  open,
  selectedDate,
  sessionsForSelectedDay,
  otherGroupAssignments = [],
  selectedDayStatus,
  dayKm,
  activeSessionId,
  detailsOpen,
  draftState,
  saveState,
  isPending,
  logsBySessionId,
  getLogForSession: getLogForSessionProp,
  onClose,
  onDayOffAll,
  onOpenSession,
  onCloseSession,
  onToggleDetails,
  onMarkAbsent,
  onMarkPresent,
  onClearOverride,
  onSaveFeedback,
  onDraftStateChange,
  getSessionStatus,
  isAbsent,
  absenceReason,
  onDeleteFeedback,
  onMarkDayAbsent,
  onRemoveDayAbsence,
  onSwitchAlternative,
  alternativeOverrideTitle,
}: FeedbackDrawerProps) {
  // Use getLogForSession helper if provided, fallback to direct lookup
  const getLog = getLogForSessionProp ?? ((id: string) => logsBySessionId[id]);
  const dragControls = useDragControls();
  const [, setLocation] = useLocation();
  const [unexpectedExpanded, setUnexpectedExpanded] = useState(false);
  const [otherGroupExpanded, setOtherGroupExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return sessionsForSelectedDay.find((s) => s.id === activeSessionId) || null;
  }, [activeSessionId, sessionsForSelectedDay]);

  useEffect(() => {
    setAdvancedOpen(false);
  }, [activeSessionId]);

  // Lock body scroll when drawer is open — prevents background scroll bleed-through
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const orig = document.body.style.cssText;
    document.body.style.cssText = `${orig}; overflow: hidden; position: fixed; top: -${scrollY}px; left: 0; right: 0;`;
    return () => {
      document.body.style.cssText = orig;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-overlay bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={cn(
              "fixed z-modal bg-background shadow-2xl overflow-hidden",
              // Mobile: bottom sheet
              "left-0 right-0 bottom-0 top-auto max-h-[calc(100dvh-env(safe-area-inset-top))] h-[88dvh] rounded-t-3xl",
              // Desktop: drawer à droite
              "sm:right-0 sm:top-0 sm:left-auto sm:bottom-auto sm:h-full sm:w-full sm:max-w-xl sm:rounded-none"
            )}
            variants={slideInFromBottom}
            initial="hidden"
            animate="visible"
            exit="exit"
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.3 }}
            dragSnapToOrigin={true}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onClose();
              }
            }}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex h-full flex-col overflow-hidden">
              <div
                className="px-5 pt-3 sm:hidden touch-none shrink-0"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="mx-auto h-1.5 w-12 rounded-full bg-muted" />
              </div>

              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-primary/15 bg-background px-4 sm:px-5 py-2.5 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary text-primary-foreground shrink-0">
                    <Waves className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-display font-bold uppercase italic tracking-tight text-primary">{dayLabelFR(selectedDate)}</div>
                  </div>
                </div>
                <IconButton onClick={onClose} label="Fermer">
                  <X className="h-5 w-5" />
                </IconButton>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {/* Header jour minimal */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex flex-col">
                      <div className="text-lg font-bold text-foreground">{dayKm} km</div>
                      <div className="flex items-center gap-1">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            selectedDayStatus.total > 0 && selectedDayStatus.completed >= 1 ? "bg-status-success" : "bg-muted-foreground/30"
                          )}
                        />
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            selectedDayStatus.total > 0 && selectedDayStatus.completed >= 2 ? "bg-status-success" : "bg-muted-foreground/30"
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <IconButton onClick={onDayOffAll} label="OFF (absent journée)" tone="dark" disabled={isPending}>
                    <Power className="h-5 w-5" />
                  </IconButton>
                </div>

                {!activeSession ? (
                  <div className="mt-3 rounded-2xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Choisis un créneau pour saisir ton ressenti. Une fois ouvert, la saisie prend toute la place.
                  </div>
                ) : null}

                {/* Planned absence */}
                {!activeSession && onMarkDayAbsent && onRemoveDayAbsence && (
                  isAbsent ? (
                    <div className="rounded-xl border border-muted bg-muted/30 p-3 mt-3 mb-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Marqué indisponible</span>
                        <button type="button" onClick={onRemoveDayAbsence} className="text-xs text-primary hover:underline">
                          Annuler
                        </button>
                      </div>
                      {absenceReason && <p className="text-xs text-muted-foreground mt-1">{absenceReason}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Annule ton indisponibilité pour saisir un retour de séance.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <AbsenceInlineButton onMark={onMarkDayAbsent} />
                    </div>
                  )
                )}

                {/* Liste séances (compacte) */}
                {!activeSession && (() => {
                  // Split: swimmer's own slots (primary, always visible even if empty)
                  // vs unexpected legacy slots (collapsed)
                  const primarySessions: PlannedSession[] = [];
                  const visibleUnexpected: PlannedSession[] = [];
                  for (const s of sessionsForSelectedDay) {
                    // Swimmer's personal slots: always in primary (even if empty)
                    if (s.swimmerSlotId) {
                      primarySessions.push(s);
                      continue;
                    }
                    // Legacy AM/PM slots: check if expected
                    const st = getSessionStatus(s, selectedDate);
                    if (st.status === "not_expected" && s.isEmpty && !getLog(s.id)) {
                      visibleUnexpected.push(s);
                    } else {
                      primarySessions.push(s);
                    }
                  }

                  const renderSessionCard = (s: PlannedSession) => {
                    const st = getSessionStatus(s, selectedDate);
                    const hasLog = Boolean(getLog(s.id));
                    const isAbsentOverride = st.status === "absent";
                    const isNotExpected = st.status === "not_expected";
                    const isAbsentLike = isAbsentOverride || isNotExpected;
                    const needsAction = st.expected && !hasLog && !isAbsentOverride;

                    // Expected slot with no assignment: invite swimmer to log manually
                    if (s.isEmpty && st.expected && !hasLog && !isAbsentOverride) {
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onOpenSession(s.id)}
                          className="group w-full min-w-0 rounded-3xl border-2 border-dashed border-primary/20 bg-primary/[0.03] px-4 py-4 text-left transition overflow-hidden hover:border-primary/40 hover:bg-primary/[0.06] hover:shadow-sm active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-11 w-11 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center transition group-hover:bg-primary/15">
                              <PenLine className="h-5 w-5 text-primary/70" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">Entraînement libre</span>
                                {s.slotTime && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                                    <Clock className="h-2.5 w-2.5" />
                                    {s.slotTime}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground/80">
                                Pas de séance coach — saisis ton ressenti
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-primary/60 group-hover:translate-x-0.5" />
                          </div>
                        </button>
                      );
                    }

                    const bg = hasLog
                      ? "bg-status-success-bg border-status-success/30"
                      : isAbsentLike
                      ? "bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800"
                      : needsAction
                      ? "bg-status-warning-bg border-status-warning/30"
                      : "bg-card border-border";

                    const SlotIcon = SLOTS.find((x) => x.key === s.slotKey)?.Icon || Circle;

                    const card = (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onOpenSession(s.id)}
                        className={cn("w-full min-w-0 rounded-3xl border px-3 py-3 text-left transition overflow-hidden", bg, "hover:shadow-sm")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                "h-10 w-10 rounded-2xl border flex items-center justify-center",
                                hasLog
                                  ? "border-status-success/30 bg-status-success-bg"
                                  : isAbsentLike
                                  ? "border-sky-200 dark:border-sky-800 bg-sky-100 dark:bg-sky-900/50"
                                  : needsAction
                                  ? "border-status-warning/30 bg-status-warning-bg"
                                  : "border-border bg-muted"
                              )}
                            >
                              <SlotIcon className="h-5 w-5 text-foreground" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-semibold text-foreground">{s.title}</div>
                                {s.slotTime ? (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                                    <Clock className="h-2.5 w-2.5" />
                                    {s.slotTime}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {s.slotKey === "AM" ? "Matin" : "Soir"}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2 flex-wrap">
                                {s.isEmpty ? <Chip>Vide</Chip> : <Chip>{fmtKm(s.km)} km</Chip>}
                                {s.assignmentSource === 'individual' && (
                                  <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                                    Séance personnalisée
                                  </span>
                                )}
                                {hasLog && (
                                  <span className="inline-flex items-center text-emerald-800">
                                    <Check className="h-4 w-4" />
                                    <span className="sr-only">Présent</span>
                                  </span>
                                )}
                                {isAbsentLike && !hasLog && (
                                  <span className="inline-flex items-center text-sky-800">
                                    <UserX className="h-4 w-4" />
                                    <span className="sr-only">Absent</span>
                                  </span>
                                )}
                                {needsAction && (
                                  <span className="inline-flex items-center text-orange-900">
                                    <Circle className="h-4 w-4" />
                                    <span className="sr-only">En attente</span>
                                  </span>
                                )}
                              </div>
                              {/* Aperçu commentaire nageur */}
                              {getLog(s.id)?.comments && (
                                <div className="mt-1.5 flex items-start gap-1.5 max-w-full">
                                  <MessageCircle className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                  <p className="text-xs text-muted-foreground line-clamp-2 italic leading-snug">
                                    {getLog(s.id)?.comments}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isNotExpected && (
                              <IconButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMarkPresent(s.id);
                                }}
                                label="Je suis venu"
                                disabled={isPending}
                              >
                                <UserCheck className="h-5 w-5" />
                              </IconButton>
                            )}

                            {st.expected && !hasLog && !isAbsentOverride && (
                              <IconButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMarkAbsent(s.id);
                                }}
                                label="Absent"
                                tone="sky"
                                disabled={isPending}
                              >
                                <UserX className="h-5 w-5" />
                              </IconButton>
                            )}
                          </div>
                        </div>
                      </button>
                    );

                    // Wrap with alternatives section if available
                    if (s.alternatives && s.alternatives.length > 0) {
                      return (
                        <div key={s.id}>
                          {card}
                          <AlternativesSection
                            alternatives={s.alternatives}
                            onSelect={onSwitchAlternative ? (aId, title, km) => onSwitchAlternative(s.id, aId, title, km) : undefined}
                          />
                        </div>
                      );
                    }

                    return card;
                  };

                  // Show rest only if swimmer has NO personal slots for this day (legacy path with all empty)
                  const hasPersonalSlots = primarySessions.some((s) => s.swimmerSlotId);
                  const allEmpty = !hasPersonalSlots && primarySessions.every((s) => s.isEmpty) && visibleUnexpected.length === 0;

                  if (allEmpty && primarySessions.length > 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <Moon className="h-8 w-8 mb-2 opacity-40" />
                        <p className="text-sm font-medium">Repos</p>
                        <p className="text-xs mt-1">Aucune séance prévue aujourd'hui</p>
                      </div>
                    );
                  }

                  return (
                    <>
                      <div className="mt-4 grid gap-2 overflow-hidden">
                        {primarySessions.map(renderSessionCard)}
                      </div>

                      {visibleUnexpected.length > 0 && (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => setUnexpectedExpanded((v) => !v)}
                            className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                          >
                            <ChevronDown className={cn("h-4 w-4 transition-transform", unexpectedExpanded && "rotate-180")} />
                            Autres créneaux du jour ({visibleUnexpected.length})
                          </button>
                          <AnimatePresence>
                            {unexpectedExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-1 grid gap-2">
                                  {visibleUnexpected.map(renderSessionCard)}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Other group sessions not in swimmer's personal schedule */}
                      {otherGroupAssignments.length > 0 && (() => {
                        const iso = selectedDate.toISOString().slice(0, 10);
                        const groupSessions: PlannedSession[] = otherGroupAssignments.map((a) => ({
                          id: `${iso}__group_${a.id}`,
                          iso,
                          slotKey: (a.assigned_slot === "morning" || a.assigned_slot === "Matin" ? "AM" : "PM") as SlotKey,
                          title: a.title,
                          km: null,
                          details: [],
                          assignmentId: a.id,
                          isEmpty: false,
                          assignmentSource: "group" as const,
                        }));
                        return (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setOtherGroupExpanded((v) => !v)}
                              className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", otherGroupExpanded && "rotate-180")} />
                              Autres séances du groupe ({groupSessions.length})
                            </button>
                            <AnimatePresence>
                              {otherGroupExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-1 grid gap-2">
                                    {groupSessions.map(renderSessionCard)}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}

                {/* Détail séance + ressenti */}
                <AnimatePresence>
                  {activeSession && (
                    <motion.div
                      key={activeSession.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: durationsSeconds.normal }}
                      className="mt-4 rounded-3xl border border-border bg-card overflow-hidden"
                    >
                      {(() => {
                        const st = getSessionStatus(activeSession, selectedDate);
                        const isAbsentOverride = st.status === "absent";
                        const isNotExpected = st.status === "not_expected";
                        const hasLog = Boolean(getLog(activeSession.id));
                        const canRate = st.expected && !isAbsentOverride;

                        const leftActionLabel = isAbsentOverride ? "Annuler" : isNotExpected ? "Je suis venu" : "Absent";

                        const leftActionFn = isAbsentOverride
                          ? () => onClearOverride(activeSession.id)
                          : isNotExpected
                          ? () => onMarkPresent(activeSession.id)
                          : () => onMarkAbsent(activeSession.id);

                        const plannedMeters = kmToMeters(activeSession.km ?? 0);

                        return (
                          <>
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                  <span>Créneau sélectionné</span>
                                  {activeSession.slotTime ? (
                                    <span className="inline-flex items-center gap-0.5 normal-case tracking-normal">
                                      <Clock className="h-2.5 w-2.5" />
                                      {activeSession.slotTime}
                                    </span>
                                  ) : (
                                    <span className="normal-case tracking-normal">
                                      {activeSession.slotKey === "AM" ? "Matin" : "Soir"}
                                    </span>
                                  )}
                                </div>
                                <div className="truncate text-sm font-semibold text-foreground">{activeSession.title}</div>
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                  {activeSession.isEmpty ? <Chip>Vide</Chip> : <Chip>{fmtKm(activeSession.km)} km</Chip>}
                                  {activeSession.assignmentSource === 'individual' && (
                                    <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                                      Séance personnalisée
                                    </span>
                                  )}
                                  {hasLog ? (
                                    <span className="inline-flex items-center text-emerald-800">
                                      <Check className="h-4 w-4" />
                                      <span className="sr-only">Présent</span>
                                    </span>
                                  ) : isAbsentOverride || isNotExpected ? (
                                    <span className="inline-flex items-center text-sky-800">
                                      <UserX className="h-4 w-4" />
                                      <span className="sr-only">Absent</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center text-orange-900">
                                      <Circle className="h-4 w-4" />
                                      <span className="sr-only">En attente</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={onCloseSession}
                                className="shrink-0 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                              >
                                Retour aux créneaux
                              </button>
                            </div>

                            {/* Banner when swimmer switched to alternative session */}
                            {alternativeOverrideTitle && (
                              <div className="mx-3 mt-2 rounded-2xl bg-primary/10 border border-primary/20 px-3 py-2">
                                <p className="text-xs font-medium text-primary">
                                  Séance changée — tu saisiras ton retour pour <span className="font-bold">{alternativeOverrideTitle}</span>
                                </p>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 p-3">
                              <button
                                type="button"
                                onClick={leftActionFn}
                                className={cn(
                                  "rounded-2xl px-3 py-3 text-sm font-semibold border transition inline-flex items-center justify-center gap-2",
                                  isNotExpected ? "bg-foreground text-background border-foreground hover:opacity-90" : "bg-card text-foreground border-border hover:bg-muted"
                                )}
                              >
                                {isNotExpected ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                {leftActionLabel}
                              </button>

                              <button
                                type="button"
                                onClick={onToggleDetails}
                                className="rounded-2xl px-3 py-3 text-sm font-semibold border border-border bg-card hover:bg-muted inline-flex items-center justify-center gap-2"
                              >
                                <FileText className="h-4 w-4" />
                                Fiche
                              </button>
                            </div>

                            <AnimatePresence>
                              {detailsOpen && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 6 }}
                                  transition={{ duration: durationsSeconds.normal }}
                                  className="mx-3 mb-3 rounded-2xl border border-border bg-muted p-3"
                                >
                                  <button
                                    type="button"
                                    onClick={() => setLocation(
                                      activeSession.assignmentId
                                        ? `/swim-session?assignmentId=${activeSession.assignmentId}`
                                        : `/swim-session`
                                    )}
                                    className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                                  >
                                    {activeSession.assignmentId ? "Ouvrir la fiche complète" : "Saisir mes détails techniques"}
                                  </button>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Coach notes */}
                            {getLog(activeSession.id)?.coach_notes && (
                              <div className="mx-3 mb-3 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-400 p-3">
                                <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Note du coach</p>
                                <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5">{getLog(activeSession.id)?.coach_notes}</p>
                              </div>
                            )}

                            {/* Commentaire nageur sauvegardé (lecture) */}
                            {getLog(activeSession.id)?.comments && (
                              <div className="mx-3 mb-3 rounded-2xl bg-muted/60 border border-border p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <MessageCircle className="h-3 w-3 text-muted-foreground" />
                                  <p className="text-[10px] font-semibold text-muted-foreground">Mon commentaire</p>
                                </div>
                                <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">{getLog(activeSession.id)?.comments}</p>
                              </div>
                            )}

                            {/* Ressenti + distance */}
                            <div className="px-4 pb-4">
                              {!canRate && (
                                <div className="mb-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 px-3 py-2 text-xs">
                                  {isAbsentOverride ? "Absent: aucun ressenti." : 'Non prévu: appuyez "Je suis venu".'}
                                </div>
                              )}

                              <motion.div
                                className="space-y-4"
                                variants={staggerChildren}
                                initial="hidden"
                                animate="visible"
                              >
                                {INDICATORS.map((ind) => {
                                  const selected = draftState[ind.key];
                                  const isMissing = showMissing && !Number.isInteger(selected);
                                  return (
                                    <motion.div
                                      key={ind.key}
                                      className={cn(
                                        "space-y-2 rounded-2xl p-2 -mx-2 transition",
                                        isMissing && "ring-2 ring-destructive transition-all"
                                      )}
                                      variants={listItem}
                                    >
                                      <div className={cn("text-sm font-semibold", !canRate ? "text-muted-foreground" : "text-foreground")}>{ind.label}</div>
                                      <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                                        <span className="text-[10px] text-muted-foreground w-12 sm:w-14 text-right shrink-0 leading-tight">
                                          {ind.mode === "hard" ? "Facile" : "Mauvaise"}
                                        </span>
                                        <div className="flex gap-1 sm:gap-1.5 flex-1 justify-center min-w-0">
                                          {[1, 2, 3, 4, 5].map((n) => {
                                            const isSel = selected === n;
                                            return (
                                              <button
                                                key={n}
                                                type="button"
                                                disabled={!canRate}
                                                onClick={() => onDraftStateChange({ ...draftState, [ind.key]: n })}
                                                className={cn(
                                                  "h-10 w-10 sm:h-11 sm:w-11 rounded-2xl border text-sm font-semibold transition shrink-0",
                                                  !canRate
                                                    ? "bg-muted text-muted-foreground border-border cursor-not-allowed"
                                                    : isSel
                                                    ? valueTone(ind.mode, n)
                                                    : "bg-card text-foreground border-border hover:bg-muted"
                                                )}
                                              >
                                                {n}
                                              </button>
                                            );
                                          })}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground w-12 sm:w-14 shrink-0 leading-tight">
                                          {ind.mode === "hard" ? "Très dur" : "Excellente"}
                                        </span>
                                      </div>
                                    </motion.div>
                                  );
                                })}

                                <motion.div className="space-y-2" variants={listItem}>
                                  <div className={cn("text-sm font-semibold", !canRate ? "text-muted-foreground" : "text-foreground")}>Commentaire</div>
                                  <textarea
                                    value={draftState.comment}
                                    onChange={(e) => onDraftStateChange({ ...draftState, comment: e.target.value })}
                                    disabled={!canRate}
                                    rows={3}
                                    maxLength={2000}
                                    placeholder="Sensations, points techniques…"
                                    className={cn(
                                      "w-full resize-none rounded-3xl border px-4 py-3 text-sm outline-none",
                                      !canRate
                                        ? "bg-muted text-muted-foreground border-border"
                                        : "bg-card text-foreground border-border focus:ring-2 focus:ring-foreground/10"
                                    )}
                                  />
                                </motion.div>
                              </motion.div>

                              <div className="mt-4 rounded-3xl border border-border bg-muted/20 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => setAdvancedOpen((openState) => !openState)}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">Ajustements avancés</div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      Kilométrage, détail par nage et suppression du ressenti
                                    </div>
                                  </div>
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                      advancedOpen && "rotate-180",
                                    )}
                                  />
                                </button>

                                <AnimatePresence initial={false}>
                                  {advancedOpen ? (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: durationsSeconds.normal }}
                                      className="overflow-hidden border-t border-border"
                                    >
                                      <div className="px-3 pb-3">
                                        {/* Stepper distance (±100m) */}
                                        <DistanceStepper
                                          plannedMeters={plannedMeters}
                                          valueMeters={draftState.distanceMeters}
                                          onChange={(m) => onDraftStateChange({ ...draftState, distanceMeters: m })}
                                          disabled={!canRate}
                                        />

                                        {/* Détail par nage (collapsible) */}
                                        <StrokeDetailForm
                                          strokes={draftState.strokes}
                                          showStrokeDetail={draftState.showStrokeDetail}
                                          disabled={!canRate}
                                          onToggle={() => onDraftStateChange({ ...draftState, showStrokeDetail: !draftState.showStrokeDetail })}
                                          onChange={(strokes) => onDraftStateChange({ ...draftState, strokes })}
                                        />

                                        {hasLog && onDeleteFeedback ? (
                                          <button
                                            type="button"
                                            onClick={() => setDeleteTarget(activeSession.id)}
                                            disabled={isPending}
                                            className="mt-4 w-full rounded-2xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                            Supprimer le ressenti
                                          </button>
                                        ) : null}
                                      </div>
                                    </motion.div>
                                  ) : null}
                                </AnimatePresence>
                              </div>

                            </div>
                          </>
                        );
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action bar outside scroll area — constrained to drawer width */}
              {activeSession && (() => {
                const st = getSessionStatus(activeSession, selectedDate);
                const canRate = st.expected && st.status !== "absent";
                const allFilled = INDICATORS.every((i) => Number.isInteger(draftState[i.key]));
                const isDisabled = isPending || saveState === "saving" || !canRate || !allFilled;
                return (
                  <BottomActionBar saveState={saveState} position="static">
                    <div
                      className="flex-1 flex flex-col items-stretch"
                      onClick={() => {
                        if (isDisabled && canRate && !allFilled) {
                          setShowMissing(true);
                          setTimeout(() => setShowMissing(false), 3000);
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={onSaveFeedback}
                        disabled={isDisabled}
                        className={cn(
                          "rounded-2xl px-4 py-3 text-sm font-semibold transition w-full",
                          isPending || saveState === "saving" || !canRate
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : allFilled
                            ? "bg-status-success text-white hover:opacity-90"
                            : "bg-status-success-bg text-status-success cursor-not-allowed"
                        )}
                      >
                        Valider
                      </button>
                      {showMissing && (
                        <div className="text-destructive text-xs text-center mt-1 font-medium">
                          Remplis les 4 indicateurs
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{"→"} km</div>
                  </BottomActionBar>
                );
              })()}
            </div>
          </motion.div>
        </>
      )}
      {onDeleteFeedback && (
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce ressenti ?</AlertDialogTitle>
              <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => { onDeleteFeedback(deleteTarget!); setDeleteTarget(null); }}>
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AnimatePresence>
  );
}
