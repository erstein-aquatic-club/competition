/**
 * SlotSessionSheet — Bottom sheet for slot actions (create/edit/visibility/delete)
 *
 * Opens when the coach taps a slot card in CoachTrainingSlotsScreen.
 * Behavior adapts to SlotState (empty / draft / published / cancelled).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  BookOpen,
  CalendarCheck,
  Pencil,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Search,
  Sparkles,
  SwatchBook,
  Trash2,
  Clock,
  MapPin,
  CalendarDays,
  Loader2,
  Ban,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Share2,
  FileDown,
} from "lucide-react";
import {
  updateSlotVisibility,
  deleteSlotAssignments,
} from "@/lib/api/assignments";
import { supabase, canUseSupabase } from "@/lib/api/client";
import type { SlotInstance, SlotState } from "@/hooks/useSlotCalendar";
import { SwimSessionTimeline } from "@/components/swim/SwimSessionTimeline";
import {
  getSwimSessionById,
  generateShareToken,
  getSwimCatalog,
} from "@/lib/api/swim";
import { getAssignedSwimCatalogIds, getEverAssignedSwimCatalogIds } from "@/lib/api/assignments";
import { ShareMenu } from "@/components/shared/ShareMenu";
import { detectTextWarnings, parseSwimText, type SwimBlock, type TextWarning } from "@/lib/swimTextParser";
import type { SwimSessionTemplate } from "@/lib/api/types";
import {
  buildItemsFromBlocks,
  calculateSwimTotalDistance,
} from "@/lib/swimSessionUtils";
import { cn } from "@/lib/utils";

// ── Props ────────────────────────────────────────────────────

export interface SlotSessionSheetProps {
  instance: SlotInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditSession: (sessionId: number) => void;
  onQuickCompose: (
    slotInstance: SlotInstance,
    blocks: SwimBlock[],
    selectedGroupIds: number[],
    targetSubgroupId: number | undefined,
    visibleFrom: string,
  ) => Promise<void>;
  onAssignFromLibrary: (
    slotInstance: SlotInstance,
    catalogId: number,
    selectedGroupIds: number[],
    targetSubgroupId: number | undefined,
    visibleFrom: string,
  ) => Promise<void>;
  onEditSlot?: (slotInstance: SlotInstance) => void;
  onManageOverride?: (slotInstance: SlotInstance) => void;
}

// ── Helpers ──────────────────────────────────────────────────

const DAY_NAMES = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

type MenuMode = "session" | "slot";

function formatTime(hhmm: string): string {
  return hhmm.slice(0, 5);
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayIndex = (date.getDay() + 6) % 7; // Monday=0
  const dayName = DAY_NAMES[dayIndex];
  const monthName = date.toLocaleDateString("fr-FR", { month: "long" });
  return `${dayName} ${d} ${monthName}`;
}

const STATE_CONFIG: Record<
  SlotState,
  { label: string; badgeClass: string }
> = {
  empty: { label: "", badgeClass: "" },
  draft: {
    label: "Brouillon",
    badgeClass:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25",
  },
  published: {
    label: "Publié",
    badgeClass:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  },
  cancelled: {
    label: "Annulé",
    badgeClass: "bg-muted text-muted-foreground border-border/50",
  },
};

// ── Component ────────────────────────────────────────────────

export default function SlotSessionSheet({
  instance,
  open,
  onOpenChange,
  onEditSession,
  onQuickCompose,
  onAssignFromLibrary,
  onEditSlot,
  onManageOverride,
}: SlotSessionSheetProps) {
  const queryClient = useQueryClient();
  // ── Local state ──────────────────────────────────────────
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState<number | undefined>(undefined);
  const [visibleFrom, setVisibleFrom] = useState("");
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>("session");
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fetch session details for preview
  const previewCatalogId = instance?.assignment?.swim_catalog_id ?? null;
  const { data: previewSession, isLoading: previewLoading } = useQuery({
    queryKey: ["swim-session-preview", previewCatalogId],
    queryFn: () => getSwimSessionById(previewCatalogId!),
    enabled: previewOpen && previewCatalogId != null,
    staleTime: 5 * 60 * 1000,
  });

  // Stable cache key: sort group ids so [1,2] and [2,1] map to the same entry.
  const subgroupKey = useMemo(
    () => [...selectedGroups].sort((a, b) => a - b).join(","),
    [selectedGroups],
  );

  // Fetch subgroups (temporary groups that are children of the selected groups)
  const { data: subgroups = [] } = useQuery({
    queryKey: ["slot-subgroups", subgroupKey],
    queryFn: async () => {
      if (!canUseSupabase() || selectedGroups.length === 0) return [];
      const { data, error } = await supabase
        .from("groups")
        .select("id, name, parent_group_id, is_active")
        .eq("is_temporary", true)
        .eq("is_active", true)
        .in("parent_group_id", selectedGroups);
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: number; name: string; parent_group_id: number; is_active: boolean }>;
    },
    enabled: selectedGroups.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Reset local state when instance changes
  useEffect(() => {
    if (!instance) return;

    setSelectedGroups(instance.groups.map((g) => g.group_id));
    setSelectedSubgroupId(undefined);
    setVisibleFrom(instance.assignment?.visible_from ?? instance.date);
    setShowVisibilityPicker(false);
    setDeleteConfirmOpen(false);
    setMenuMode(instance.state === "cancelled" ? "slot" : "session");
    setPreviewOpen(false);
  }, [instance]);

  // ── Mutations ────────────────────────────────────────────
  const invalidateSlotAssignments = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["slot-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["resolved-assignments-batch"] });
  }, [queryClient]);

  const visibilityMutation = useMutation({
    mutationFn: (params: {
      trainingSlotId: string;
      scheduledDate: string;
      visibleFrom: string | null;
    }) => updateSlotVisibility(params),
    onSuccess: () => {
      invalidateSlotAssignments();
      setShowVisibilityPicker(false);
      toast("Visibilité mise à jour");
    },
    onError: () => {
      toast.error("Erreur", { description: "Impossible de modifier la visibilité." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (params: {
      trainingSlotId: string;
      scheduledDate: string;
    }) => deleteSlotAssignments(params),
    onSuccess: () => {
      invalidateSlotAssignments();
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      toast("Séance supprimée du créneau", { description: "Cette action est irréversible." });
    },
    onError: () => {
      toast.error("Erreur", { description: "Impossible de supprimer la séance." });
    },
  });

  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportPdf = async () => {
    if (!instance || !previewCatalogId) return;
    setExportingPdf(true);
    try {
      const session =
        previewSession ??
        (await queryClient.fetchQuery({
          queryKey: ["swim-session-preview", previewCatalogId],
          queryFn: () => getSwimSessionById(previewCatalogId),
          staleTime: 5 * 60 * 1000,
        }));
      if (!session) throw new Error("Session introuvable");
      const { exportSessionPdf, formatTimeForPdfHeader } = await import("@/lib/export-session-pdf");
      const dateSlug = instance.date.replaceAll("-", "");
      await exportSessionPdf(session, {
        date: instance.date,
        timeRange: `${formatTimeForPdfHeader(instance.slot.start_time)} – ${formatTimeForPdfHeader(instance.slot.end_time)}`,
        location: instance.slot.location,
        groups: instance.groups.map((g) => g.group_name).join(", "),
        filenameSlug: `coach-seance-${dateSlug}`,
      });
    } catch {
      toast.error("Erreur", { description: "Impossible de générer le PDF." });
    } finally {
      setExportingPdf(false);
    }
  };

  // ── Handlers ─────────────────────────────────────────────
  const handleToggleGroup = (groupId: number) => {
    setSelectedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const handleSaveVisibility = () => {
    if (!instance) return;
    visibilityMutation.mutate({
      trainingSlotId: instance.slot.id,
      scheduledDate: instance.date,
      visibleFrom: visibleFrom || null,
    });
  };

  const handleConfirmDelete = () => {
    if (!instance) return;
    deleteMutation.mutate({
      trainingSlotId: instance.slot.id,
      scheduledDate: instance.date,
    });
  };

  const handleEditSlot = () => {
    if (!instance || !onEditSlot) return;
    onOpenChange(false);
    onEditSlot(instance);
  };

  const handleManageOverride = () => {
    if (!instance || !onManageOverride) return;
    onOpenChange(false);
    onManageOverride(instance);
  };

  const handleSheetOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setPreviewOpen(false);
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  // ── Guard ────────────────────────────────────────────────
  if (!instance) return null;

  const { state, slot, assignment, override, groups } = instance;
  const cfg = STATE_CONFIG[state];
  const sessionDisabled = state === "cancelled";

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl max-h-[90dvh] overflow-y-auto px-5 pb-8 pt-4"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border/60" />

          {previewOpen ? (
            /* ── Preview mode ── */
            <>
              <SheetHeader className="sr-only">
                <SheetTitle>{assignment?.session_name ?? "Séance"}</SheetTitle>
                <SheetDescription>Aperçu de la séance</SheetDescription>
              </SheetHeader>
              <div className="flex items-center gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground active:scale-95 transition-transform"
                  aria-label="Retour"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h3 className="flex-1 text-base font-semibold tracking-tight truncate">
                  {assignment?.session_name ?? "Séance"}
                </h3>
                {assignment?.swim_catalog_id != null && (
                  <ShareMenu
                    onOpen={async () => {
                      const token = await generateShareToken(assignment.swim_catalog_id!);
                      const url = `${window.location.origin}${window.location.pathname}#/s/${token}`;
                      return { url, title: assignment?.session_name ?? "Séance" };
                    }}
                    trigger={
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground active:scale-95 transition-transform disabled:opacity-50"
                        aria-label="Partager la séance"
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                    }
                  />
                )}
              </div>
              {previewLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : previewSession ? (
                <SwimSessionTimeline
                  title={previewSession.name}
                  description={previewSession.description ?? undefined}
                  items={previewSession.items}
                />
              ) : (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Impossible de charger la séance.
                </p>
              )}
            </>
          ) : (
            /* ── Normal mode ── */
            <>
              <SheetHeader className="mb-5 space-y-1.5 text-left">
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-base font-bold leading-tight">
                    {formatDateFr(instance.date)}
                  </SheetTitle>
                  {state !== "empty" && (
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-2 py-0.5 font-medium leading-none ${cfg.badgeClass}`}
                    >
                      {cfg.label}
                    </Badge>
                  )}
                </div>
                <SheetDescription className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3 opacity-60" />
                    {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3 opacity-60" />
                    {slot.location}
                  </span>
                </SheetDescription>
              </SheetHeader>

              <MenuModePicker
                mode={menuMode}
                onModeChange={setMenuMode}
                sessionDisabled={sessionDisabled}
              />

              {menuMode === "session" ? (
                <>
                  {state === "cancelled" && (
                    <SessionUnavailableBody override={override} />
                  )}
                  {state === "empty" && (
                    <QuickComposeBody
                      instance={instance}
                      groups={groups}
                      selectedGroups={selectedGroups}
                      subgroups={subgroups}
                      selectedSubgroupId={selectedSubgroupId}
                      onSubgroupChange={setSelectedSubgroupId}
                      visibleFrom={visibleFrom}
                      onToggleGroup={handleToggleGroup}
                      onVisibleFromChange={setVisibleFrom}
                      onQuickCompose={onQuickCompose}
                      onAssignFromLibrary={onAssignFromLibrary}
                    />
                  )}
                  {(state === "draft" || state === "published") && (
                    <FilledBody
                      instance={instance}
                      assignment={assignment!}
                      showVisibilityPicker={showVisibilityPicker}
                      visibleFrom={visibleFrom}
                      visibilityLoading={visibilityMutation.isPending}
                      deleteLoading={deleteMutation.isPending}
                      onToggleVisibilityPicker={() =>
                        setShowVisibilityPicker((v) => !v)
                      }
                      onVisibleFromChange={setVisibleFrom}
                      onSaveVisibility={handleSaveVisibility}
                      onEditSession={onEditSession}
                      onRequestDelete={() => setDeleteConfirmOpen(true)}
                      onPreview={assignment?.swim_catalog_id != null ? () => setPreviewOpen(true) : undefined}
                      onExportPdf={assignment?.swim_catalog_id != null ? handleExportPdf : undefined}
                      isExportingPdf={exportingPdf}
                    />
                  )}
                </>
              ) : (
                <SlotManagementPanel
                  state={state}
                  override={override}
                  canEditSlot={!!onEditSlot}
                  canManageOverride={!!onManageOverride}
                  onEditSlot={handleEditSlot}
                  onManageOverride={handleManageOverride}
                />
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer la séance du {formatDateFr(instance.date)} ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {assignment?.session_name && (
                  <div className="font-semibold text-foreground">
                    {assignment.session_name}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {state === "published" && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">
                      Publiée
                    </span>
                  )}
                  {state === "draft" && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
                      Brouillon
                    </span>
                  )}
                  {groups.map((g) => (
                    <span
                      key={g.group_id}
                      className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary"
                    >
                      {g.group_name}
                    </span>
                  ))}
                </div>
                <p className="text-muted-foreground">
                  {state === "published"
                    ? "Cette séance est visible par les nageurs. La supprimer la retirera immédiatement de leur planning."
                    : "Cette action supprimera définitivement la séance pour ce créneau."}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                "Supprimer"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MenuModePicker({
  mode,
  onModeChange,
  sessionDisabled,
}: {
  mode: MenuMode;
  onModeChange: (mode: MenuMode) => void;
  sessionDisabled: boolean;
}) {
  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 gap-2">
        <ModeCard
          title="Séance"
          description={
            sessionDisabled
              ? "Indisponible tant que le créneau est annulé"
              : "Créer, modifier ou publier"
          }
          active={mode === "session"}
          disabled={sessionDisabled}
          onClick={() => onModeChange("session")}
        />
        <ModeCard
          title="Créneau"
          description="Horaires, lieu et exception"
          active={mode === "slot"}
          onClick={() => onModeChange("slot")}
        />
      </div>
    </div>
  );
}

function ModeCard({
  title,
  description,
  active,
  disabled = false,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-2xl border px-4 py-3 text-left transition-all
        ${disabled ? "cursor-not-allowed opacity-50" : "active:scale-[0.98]"}
        ${
          active
            ? "border-primary/40 bg-primary/8 shadow-sm"
            : "border-border/50 bg-muted/20 hover:bg-muted/35"
        }
      `}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        {description}
      </p>
    </button>
  );
}


function SessionUnavailableBody({
  override,
}: {
  override?: SlotInstance["override"];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/50 bg-muted/30 p-4 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
          <Ban className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium text-foreground">
          Ce créneau est annulé
        </p>
        {override?.reason && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Motif : {override.reason}
          </p>
        )}
      </div>
    </div>
  );
}

// ── QuickComposeBody ────────────────────────────────────────
//
// Empty slot → compose a session in a single surface: paste text (live parse)
// or pick from library. Create-and-assign happens in one chained mutation
// handled by the parent via onQuickCompose / onAssignFromLibrary.

function estimateDurationMinutes(distance: number): number {
  if (distance <= 0) return 0;
  return Math.max(5, Math.round((distance / 100) * 2));
}

function QuickComposeBody({
  instance,
  groups,
  selectedGroups,
  subgroups,
  selectedSubgroupId,
  onSubgroupChange,
  visibleFrom,
  onToggleGroup,
  onVisibleFromChange,
  onQuickCompose,
  onAssignFromLibrary,
}: {
  instance: SlotInstance;
  groups: SlotInstance["groups"];
  selectedGroups: number[];
  subgroups: Array<{ id: number; name: string; parent_group_id: number; is_active: boolean }>;
  selectedSubgroupId: number | undefined;
  onSubgroupChange: (id: number | undefined) => void;
  visibleFrom: string;
  onToggleGroup: (groupId: number) => void;
  onVisibleFromChange: (date: string) => void;
  onQuickCompose: SlotSessionSheetProps["onQuickCompose"];
  onAssignFromLibrary: SlotSessionSheetProps["onAssignFromLibrary"];
}) {
  const [tab, setTab] = useState<"text" | "library">("text");
  const [rawText, setRawText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [showBlocks, setShowBlocks] = useState(false);

  // Debounce parsing (300ms) — the parser walks the full text for every keystroke
  // and rebuilds backdrop lines, which stutters on long sessions.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(rawText), 300);
    return () => clearTimeout(t);
  }, [rawText]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [assigningCatalogId, setAssigningCatalogId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [splitDistanceAlertOpen, setSplitDistanceAlertOpen] = useState(false);
  const splitDistanceConfirmRef = useRef<((proceed: boolean) => void) | null>(null);

  const isVisibleFromValid = !visibleFrom || visibleFrom <= instance.date;
  const hasGroup = selectedGroups.length > 0;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.style.transform = `translateY(-${textareaRef.current.scrollTop}px)`;
    }
  }, []);

  // ── Live parse (debounced) ──
  const parsedBlocks = useMemo<SwimBlock[]>(() => {
    if (!debouncedText.trim()) return [];
    try {
      return parseSwimText(debouncedText);
    } catch {
      return [];
    }
  }, [debouncedText]);

  const parsedItems = useMemo(
    () => buildItemsFromBlocks(parsedBlocks),
    [parsedBlocks],
  );

  // Warnings always computed — the textarea backdrop highlights suspicious lines
  // so users see issues before they click "Voir les blocs".
  const textWarnings = useMemo<TextWarning[]>(
    () => (debouncedText.trim() ? detectTextWarnings(debouncedText) : []),
    [debouncedText],
  );

  const backdropLines = useMemo(() => {
    if (textWarnings.length === 0) return null;
    const warningSet = new Set(textWarnings.map((w) => w.lineIndex));
    return rawText.split("\n").map((line, i) => (
      <span key={i}>
        <span
          className={cn(
            "text-transparent",
            warningSet.has(i) && "rounded-[2px] bg-amber-200/70 dark:bg-amber-700/40",
          )}
        >
          {line || "\u200B"}
        </span>
        {"\n"}
      </span>
    ));
  }, [rawText, textWarnings]);

  const totalDistance = useMemo(
    () => calculateSwimTotalDistance(parsedItems),
    [parsedItems],
  );

  const estimatedMinutes = estimateDurationMinutes(totalDistance);

  const canSubmitText =
    parsedBlocks.length > 0 &&
    hasGroup &&
    isVisibleFromValid &&
    !submitting;

  // ── Library data (only when tab active) ──
  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["swim_catalog"],
    queryFn: () => getSwimCatalog(),
    enabled: tab === "library",
    staleTime: 60_000,
  });

  const { data: assignedIds } = useQuery({
    queryKey: ["ever_assigned_swim_catalog_ids"],
    queryFn: () => getEverAssignedSwimCatalogIds(),
    enabled: tab === "library",
    staleTime: 60_000,
  });

  const filteredCatalog = useMemo<SwimSessionTemplate[]>(() => {
    if (!catalog) return [];
    const q = debouncedSearch.trim().toLowerCase();
    return catalog
      .filter((s) => !s.is_archived)
      .filter((s) => !assignedIds?.has(s.id))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.folder ?? "").toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [catalog, debouncedSearch, assignedIds]);

  const libraryDisabled = !hasGroup || !isVisibleFromValid || submitting;

  // ── Handlers ──
  const handleTextSubmit = async () => {
    if (!canSubmitText || submittingRef.current) return;
    const splitWarnings = textWarnings.filter((w) => w.type === "split_distance");
    if (splitWarnings.length > 0) {
      const proceed = await new Promise<boolean>((resolve) => {
        splitDistanceConfirmRef.current = resolve;
        setSplitDistanceAlertOpen(true);
      });
      if (!proceed) return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onQuickCompose(
        instance,
        parsedBlocks,
        selectedGroups,
        selectedSubgroupId,
        visibleFrom,
      );
      // Parent closes the sheet via showSessionSheet=false on success.
    } catch {
      // Parent shows the error toast.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleLibrarySelect = async (catalogId: number) => {
    if (libraryDisabled || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setAssigningCatalogId(catalogId);
    try {
      await onAssignFromLibrary(
        instance,
        catalogId,
        selectedGroups,
        selectedSubgroupId,
        visibleFrom,
      );
    } catch {
      // Parent shows the error toast.
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setAssigningCatalogId(null);
    }
  };

  return (
    <div className="space-y-5">
      {groups.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Groupes concernés
          </p>
          <div className="space-y-2.5">
            {groups.map((g) => (
              <label
                key={g.id}
                className="flex items-center gap-3 cursor-pointer min-h-[44px] py-1.5"
              >
                <Checkbox
                  checked={selectedGroups.includes(g.group_id)}
                  onCheckedChange={() => onToggleGroup(g.group_id)}
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium text-foreground">
                  {g.group_name}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
          <div>
            <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
              Aucun groupe assigné
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Configurez les groupes de ce créneau avant d'assigner une séance.
            </p>
          </div>
        </div>
      )}

      {subgroups.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sous-groupe (optionnel)
          </Label>
          <Select
            value={selectedSubgroupId != null ? String(selectedSubgroupId) : "none"}
            onValueChange={(v) => onSubgroupChange(v === "none" ? undefined : Number(v))}
          >
            <SelectTrigger className="w-full rounded-xl border-border bg-muted/30">
              <SelectValue placeholder="Tous les nageurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Tous les nageurs</SelectItem>
              {subgroups.map((sg) => (
                <SelectItem key={sg.id} value={String(sg.id)}>
                  {sg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label
          htmlFor="visible-from-empty"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          <CalendarDays className="mr-1 inline h-3 w-3 opacity-60" />
          Visible à partir du
        </Label>
        <p className="text-[11px] text-muted-foreground -mt-1 mb-1.5">
          Laissez sur aujourd'hui pour publier immédiatement. Sinon, les nageurs verront la séance à partir de cette date.
        </p>
        <input
          id="visible-from-empty"
          type="date"
          value={visibleFrom}
          onChange={(e) => onVisibleFromChange(e.target.value)}
          className={`w-full rounded-xl border px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
            !isVisibleFromValid
              ? "border-destructive bg-destructive/5"
              : "border-border bg-muted/30"
          }`}
        />
        {!isVisibleFromValid && (
          <p className="text-xs text-destructive">
            La date ne peut pas être postérieure au jour du créneau.
          </p>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center rounded-xl border border-border bg-muted/50 p-0.5">
        <button
          type="button"
          onClick={() => setTab("text")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
            tab === "text"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          Texte
        </button>
        <button
          type="button"
          onClick={() => setTab("library")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
            tab === "library"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Bibliothèque
        </button>
      </div>

      {tab === "text" ? (
        <div className="space-y-3">
          <div
            className={cn(
              "flex flex-col gap-3",
              showBlocks &&
                parsedBlocks.length > 0 &&
                "md:flex-row md:items-stretch",
            )}
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-2xl border border-border bg-card focus-within:ring-2 focus-within:ring-ring",
                showBlocks && parsedBlocks.length > 0 && "md:flex-1",
              )}
            >
              {backdropLines && (
                <div
                  ref={backdropRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
                >
                  {backdropLines}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                onScroll={syncScroll}
                placeholder={"Collez ou tapez votre séance ici…\n\nEx.\nÉchauffement\n4x100 crawl V1 R30\n\nCorps\n2x(4x100 NL V3)\n6x50 papillon V2"}
                className={cn(
                  "relative min-h-[200px] w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none",
                  showBlocks && parsedBlocks.length > 0 && "md:min-h-[340px] md:resize-none",
                )}
              />
            </div>
            {showBlocks && parsedBlocks.length > 0 && (
              <div className="md:flex-1 rounded-2xl border border-border/50 bg-muted/10 p-2 md:max-h-[420px] md:overflow-y-auto">
                <SwimSessionTimeline
                  title="Prévisualisation"
                  items={parsedItems}
                  showHeader={false}
                />
              </div>
            )}
          </div>

          {parsedBlocks.length > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-primary/20 bg-primary/5 px-2 py-2.5">
                <QuickStat label="Blocs" value={String(parsedBlocks.length)} />
                <QuickStat
                  label="Mètres"
                  value={totalDistance.toLocaleString("fr-FR")}
                />
                <QuickStat
                  label="Durée"
                  value={estimatedMinutes > 0 ? `~ ${estimatedMinutes}′` : "—"}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowBlocks((v) => !v)}
                className="inline-flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted/50"
              >
                <span className="inline-flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 opacity-70" />
                  {showBlocks ? "Masquer les blocs" : "Voir les blocs"}
                  {textWarnings.length > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      {textWarnings.length} avertissement{textWarnings.length > 1 ? "s" : ""}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    showBlocks && "rotate-180",
                  )}
                />
              </button>
            </>
          ) : (
            debouncedText.trim().length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                Aucun bloc reconnu. Vérifiez le format (titre de bloc sur une
                ligne, exercices en dessous).
              </div>
            )
          )}

          <div className="sticky bottom-0 -mx-5 -mb-8 border-t border-border/50 bg-background/95 px-5 py-3.5 backdrop-blur-sm">
            <button
              type="button"
              onClick={handleTextSubmit}
              disabled={!canSubmitText}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-semibold transition-colors",
                canSubmitText
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {submitting ? "Assignation…" : "Créer & assigner"}
            </button>

            {!hasGroup && parsedBlocks.length > 0 && (
              <p className="text-center text-[11px] text-muted-foreground mt-2">
                Sélectionnez au moins un groupe pour activer le bouton.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une séance…"
              className="w-full rounded-xl border border-border bg-muted/30 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {!hasGroup && (
            <p className="text-xs text-muted-foreground italic px-0.5">
              Sélectionnez au moins un groupe pour assigner depuis la bibliothèque.
            </p>
          )}

          <div className="max-h-[360px] space-y-1.5 overflow-y-auto pr-0.5">
            {catalogLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="inline h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCatalog.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Aucune séance trouvée.
              </p>
            ) : (
              filteredCatalog.map((s) => {
                const distance = calculateSwimTotalDistance(s.items ?? []);
                const isAssigned = assignedIds?.has(s.id) ?? false;
                const isThisAssigning = assigningCatalogId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={libraryDisabled}
                    onClick={() => handleLibrarySelect(s.id)}
                    className={cn(
                      "flex w-full min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      isAssigned
                        ? "border-emerald-500/25 bg-emerald-500/5"
                        : "border-border bg-card hover:bg-muted/40",
                      libraryDisabled
                        ? "opacity-50 cursor-not-allowed"
                        : "active:scale-[0.98]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        isAssigned
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {isThisAssigning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isAssigned ? (
                        <CalendarCheck className="h-4 w-4" />
                      ) : (
                        <SwatchBook className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {s.name}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {distance > 0 && (
                          <span>{distance.toLocaleString("fr-FR")} m</span>
                        )}
                        {distance > 0 && s.folder && <span aria-hidden>·</span>}
                        {s.folder && <span className="truncate">{s.folder}</span>}
                        {isAssigned && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              Déjà assignée
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <AlertDialog
        open={splitDistanceAlertOpen}
        onOpenChange={(open) => {
          if (!open && splitDistanceConfirmRef.current) {
            splitDistanceConfirmRef.current(false);
            splitDistanceConfirmRef.current = null;
          }
          setSplitDistanceAlertOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Distance partielle détectée</AlertDialogTitle>
            <AlertDialogDescription>
              {textWarnings.filter((w) => w.type === "split_distance").length} ligne(s)
              avec distance partielle (ex : « 10 EZ » perdu après le « / »). Assigner
              quand même ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                if (splitDistanceConfirmRef.current) {
                  splitDistanceConfirmRef.current(false);
                  splitDistanceConfirmRef.current = null;
                }
                setSplitDistanceAlertOpen(false);
              }}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (splitDistanceConfirmRef.current) {
                  splitDistanceConfirmRef.current(true);
                  splitDistanceConfirmRef.current = null;
                }
                setSplitDistanceAlertOpen(false);
              }}
            >
              Assigner quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-primary tabular-nums leading-none">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

// ── FilledBody (draft / published) ──────────────────────────

function FilledBody({
  instance,
  assignment,
  showVisibilityPicker,
  visibleFrom,
  visibilityLoading,
  deleteLoading,
  onToggleVisibilityPicker,
  onVisibleFromChange,
  onSaveVisibility,
  onEditSession,
  onRequestDelete,
  onPreview,
  onExportPdf,
  isExportingPdf,
}: {
  instance: SlotInstance;
  assignment: NonNullable<SlotInstance["assignment"]>;
  showVisibilityPicker: boolean;
  visibleFrom: string;
  visibilityLoading: boolean;
  deleteLoading: boolean;
  onToggleVisibilityPicker: () => void;
  onVisibleFromChange: (date: string) => void;
  onSaveVisibility: () => void;
  onEditSession: (sessionId: number) => void;
  onRequestDelete: () => void;
  onPreview?: () => void;
  onExportPdf?: () => void;
  isExportingPdf?: boolean;
}) {
  const isVisibleFromValid = !visibleFrom || visibleFrom <= instance.date;

  return (
    <div className="space-y-5">
      {onPreview ? (
        <button
          type="button"
          onClick={onPreview}
          className="w-full rounded-xl border border-border/50 bg-muted/30 p-4 text-left transition-colors active:scale-[0.98] active:bg-muted/50 hover:bg-muted/40 cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {assignment.session_name ?? "Séance sans nom"}
            </p>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          </div>
          {assignment.session_distance != null &&
            assignment.session_distance > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {assignment.session_distance} m
              </p>
            )}
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[10px] px-2 py-0.5 font-medium leading-none ${STATE_CONFIG[instance.state].badgeClass}`}
            >
              {STATE_CONFIG[instance.state].label}
            </Badge>
            {assignment.visible_from && (
              <span className="text-[10px] text-muted-foreground">
                Visible le{" "}
                {new Date(assignment.visible_from).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
        </button>
      ) : (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {assignment.session_name ?? "Séance sans nom"}
          </p>
          {assignment.session_distance != null &&
            assignment.session_distance > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {assignment.session_distance} m
              </p>
            )}
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[10px] px-2 py-0.5 font-medium leading-none ${STATE_CONFIG[instance.state].badgeClass}`}
            >
              {STATE_CONFIG[instance.state].label}
            </Badge>
            {assignment.visible_from && (
              <span className="text-[10px] text-muted-foreground">
                Visible le{" "}
                {new Date(assignment.visible_from).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
          </div>
        </div>
      )}

      {instance.groups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {instance.groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground"
            >
              {g.group_name}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        {assignment.swim_catalog_id != null && (
          <ActionButton
            icon={<Pencil className="h-4 w-4" />}
            label="Modifier la séance"
            description="Ouvrir dans l'éditeur"
            onClick={() => onEditSession(assignment.swim_catalog_id!)}
            highlight
          />
        )}

        {onExportPdf && (
          <ActionButton
            icon={
              isExportingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )
            }
            label="Télécharger PDF"
            description="Séance en une page, pour le bord du bassin"
            disabled={isExportingPdf}
            onClick={onExportPdf}
          />
        )}

        <ActionButton
          icon={
            showVisibilityPicker ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )
          }
          label="Visibilité"
          description="Définir la date de publication"
          onClick={onToggleVisibilityPicker}
        />

        {showVisibilityPicker && (
          <div className="ml-12 space-y-2.5 rounded-xl border border-border/50 bg-muted/20 p-3">
            <Label
              htmlFor="visible-from-edit"
              className="text-xs text-muted-foreground"
            >
              Visible à partir du
            </Label>
            <p className="text-[11px] text-muted-foreground -mt-1 mb-1.5">
              Laissez sur aujourd'hui pour publier immédiatement. Sinon, les nageurs verront la séance à partir de cette date.
            </p>
            <input
              id="visible-from-edit"
              type="date"
              value={visibleFrom}
              onChange={(e) => onVisibleFromChange(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                !isVisibleFromValid
                  ? "border-destructive bg-destructive/5"
                  : "border-border bg-background"
              }`}
            />
            {!isVisibleFromValid && (
              <p className="text-xs text-destructive">
                La date ne peut pas être postérieure au jour du créneau.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 rounded-lg"
                disabled={visibilityLoading || !isVisibleFromValid}
                onClick={onSaveVisibility}
              >
                {visibilityLoading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Enregistrer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-lg"
                disabled={visibilityLoading}
                onClick={onToggleVisibilityPicker}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}

        <ActionButton
          icon={<Copy className="h-4 w-4" />}
          label="Dupliquer vers..."
          description="Bientôt disponible"
          disabled
          onClick={() => {}}
        />

        <ActionButton
          icon={<Trash2 className="h-4 w-4" />}
          label="Supprimer"
          description="Retirer cette séance du créneau"
          variant="destructive"
          disabled={deleteLoading}
          onClick={onRequestDelete}
        />
      </div>
    </div>
  );
}

function SlotManagementPanel({
  state,
  override,
  canEditSlot,
  canManageOverride,
  onEditSlot,
  onManageOverride,
}: {
  state: SlotState;
  override?: SlotInstance["override"];
  canEditSlot: boolean;
  canManageOverride: boolean;
  onEditSlot: () => void;
  onManageOverride: () => void;
}) {
  if (!canEditSlot && !canManageOverride) return null;

  return (
    <div className="space-y-4">
      {state === "cancelled" && (
        <div className="rounded-2xl border border-border/50 bg-muted/30 px-4 py-3">
          <p className="text-sm font-medium text-foreground">Créneau annulé</p>
          {override?.reason && (
            <p className="mt-1 text-xs text-muted-foreground">
              Motif : {override.reason}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {canEditSlot && (
          <ActionButton
            icon={<Pencil className="h-4 w-4" />}
            label="Modifier le créneau"
            description="Horaires, lieu et groupes"
            onClick={onEditSlot}
            highlight
          />
        )}
        {canManageOverride && (
          <ActionButton
            icon={<CalendarDays className="h-4 w-4" />}
            label="Gérer l'exception"
            description="Annuler ou ajuster ce jour précis"
            onClick={onManageOverride}
          />
        )}
      </div>
    </div>
  );
}

// ── ActionButton ────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  description,
  variant = "default",
  disabled = false,
  highlight = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  variant?: "default" | "destructive";
  disabled?: boolean;
  highlight?: boolean;
  onClick: () => void;
}) {
  const isDestructive = variant === "destructive";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors
        ${disabled ? "opacity-40 cursor-not-allowed" : "active:scale-[0.98]"}
        ${
          isDestructive
            ? "bg-destructive/5 hover:bg-destructive/10 active:bg-destructive/15"
            : highlight
              ? "bg-primary/10 hover:bg-primary/15 active:bg-primary/20"
              : "bg-muted/40 hover:bg-muted/60 active:bg-muted/80"
        }
      `}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isDestructive
            ? "bg-destructive/10 text-destructive"
            : highlight
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            isDestructive ? "text-destructive" : "text-foreground"
          }`}
        >
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </button>
  );
}
