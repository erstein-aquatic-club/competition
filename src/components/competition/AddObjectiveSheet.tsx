import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getObjectives,
  getCompetitions,
  createObjective,
  linkObjectiveToCompetition,
} from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  FFN_EVENTS,
  eventLabel,
  parseTime,
  formatTime,
} from "@/lib/objectiveHelpers";
import { selectLinkableForCompetition } from "./info-helpers";
import type { Objective, ObjectiveInput } from "@/lib/api/types";
import { Trophy, Link2 } from "lucide-react";

type ObjectiveType = "chrono" | "texte" | "both";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competitionId: string;
  competitionName: string;
  /** Supabase auth UUID — required to populate athlete_id on createObjective. */
  authUid: string | null;
}

export default function AddObjectiveSheet({
  open,
  onOpenChange,
  competitionId,
  competitionName,
  authUid,
}: Props) {
  const queryClient = useQueryClient();
  /* ── Linkable objectives query ─────────────────── */
  // Gate on authUid: getAthleteObjectives() relies on supabase.auth.getUser()
  // which returns null during the auth-bootstrap window. Without this gate,
  // the query fires too early, caches `[]` under ["athlete-objectives"], and
  // the Lier tab stays at 0 forever (cohérent avec SwimmerObjectivesView §192).
  // Use authUid (sync from Zustand) directly — bypass getAthleteObjectives()
  // which calls supabase.auth.getUser() async (can race / null-out).
  const { data: allObjectives = [] } = useQuery({
    queryKey: ["athlete-objectives", authUid],
    queryFn: () => (authUid ? getObjectives(authUid) : Promise.resolve([])),
    enabled: !!authUid,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
  });

  const linkable = useMemo(
    () => selectLinkableForCompetition(allObjectives, competitionId),
    [allObjectives, competitionId],
  );

  /* ── Competitions query (for multi-comp badges in summary) ── */
  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });
  const competitionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of competitions) m.set(c.id, c.name);
    return m;
  }, [competitions]);

  /* ── Tab state ─────────────────────────────────── */
  const [tab, setTab] = useState<"create" | "link">("create");
  useEffect(() => {
    if (linkable.length === 0 && tab === "link") setTab("create");
  }, [linkable.length, tab]);

  /* ── Create form state ─────────────────────────── */
  const [objType, setObjType] = useState<ObjectiveType>("chrono");
  const [eventCode, setEventCode] = useState("");
  const [poolLength, setPoolLength] = useState("50");
  const [targetTime, setTargetTime] = useState("");
  const [text, setText] = useState("");

  /* ── Link form state ───────────────────────────── */
  const [selectedObjIds, setSelectedObjIds] = useState<Set<string>>(new Set());

  /* ── Reset on close ────────────────────────────── */
  useEffect(() => {
    if (!open) {
      setTab("create");
      setObjType("chrono");
      setEventCode("");
      setPoolLength("50");
      setTargetTime("");
      setText("");
      setSelectedObjIds(new Set());
    }
  }, [open]);

  /* ── Mutations ─────────────────────────────────── */
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["athlete-objectives"] });

  const createMut = useMutation({
    mutationFn: (input: ObjectiveInput) => createObjective(input),
    onSuccess: () => {
      toast("Objectif créé");
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  const linkMut = useMutation({
    mutationFn: async (ids: string[]) => {
      // Sequential to surface individual errors clearly; could be Promise.all
      // if we want parallelism. Idempotent UPSERT means retries are safe.
      for (const id of ids) {
        await linkObjectiveToCompetition(id, competitionId);
      }
    },
    onSuccess: (_data, ids) => {
      toast(ids.length === 1);
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  const isPending = createMut.isPending || linkMut.isPending;

  const showChrono = objType === "chrono" || objType === "both";
  const showText = objType === "texte" || objType === "both";

  const handleCreate = () => {
    if (showChrono && !eventCode) {
      toast.error("Épreuve requise");
      return;
    }
    if (showChrono && targetTime && parseTime(targetTime) === null) {
      toast.error("Format invalide", { description: "Format : m:ss:cc (ex: 1:05:30)" });
      return;
    }
    if (showText && !text.trim()) {
      toast.error("Texte requis");
      return;
    }
    if (!authUid) {
      toast.error("Session expirée");
      return;
    }

    const input: ObjectiveInput = {
      athlete_id: authUid,
      competition_id: competitionId,
      event_code: showChrono ? eventCode : null,
      pool_length: showChrono ? Number(poolLength) : null,
      target_time_seconds:
        showChrono && targetTime ? parseTime(targetTime) : null,
      text: showText ? text.trim() : null,
    };

    createMut.mutate(input);
  };

  const handleLink = () => {
    if (selectedObjIds.size === 0) return;
    linkMut.mutate(Array.from(selectedObjIds));
  };

  /* ── Render ────────────────────────────────────── */

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ajouter un objectif</SheetTitle>
          <SheetDescription>Compétition : {competitionName}</SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "create" | "link")}
          className="mt-4"
        >
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="create" className="text-xs">
              <Trophy className="mr-1.5 h-3.5 w-3.5" />
              Créer un nouveau
            </TabsTrigger>
            <TabsTrigger
              value="link"
              className="text-xs"
              disabled={linkable.length === 0}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Lier un existant ({linkable.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Create tab ───────────────────── */}
          <TabsContent value="create" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Type d'objectif</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={objType}
                onValueChange={(v) => {
                  if (v) setObjType(v as ObjectiveType);
                }}
                className="justify-start"
              >
                <ToggleGroupItem value="chrono" className="text-xs">
                  Chrono
                </ToggleGroupItem>
                <ToggleGroupItem value="texte" className="text-xs">
                  Texte
                </ToggleGroupItem>
                <ToggleGroupItem value="both" className="text-xs">
                  Les deux
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {showChrono && (
              <>
                <div className="space-y-2">
                  <Label>Épreuve *</Label>
                  <Select value={eventCode} onValueChange={setEventCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une épreuve" />
                    </SelectTrigger>
                    <SelectContent>
                      {FFN_EVENTS.map((code) => (
                        <SelectItem key={code} value={code}>
                          {eventLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bassin</Label>
                  <Select value={poolLength} onValueChange={setPoolLength}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25m</SelectItem>
                      <SelectItem value="50">50m</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Temps cible (min:sec:centièmes)</Label>
                  <Input
                    placeholder="Ex : 1:05:30"
                    value={targetTime}
                    onChange={(e) => setTargetTime(e.target.value)}
                  />
                </div>
              </>
            )}

            {showText && (
              <div className="space-y-2">
                <Label>Objectif texte *</Label>
                <Textarea
                  placeholder="Ex : Améliorer la coulée de dos"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
            )}

            <Button
              type="button"
              className="w-full h-11"
              onClick={handleCreate}
              disabled={isPending}
            >
              {createMut.isPending ? "Création..." : "Créer"}
            </Button>
          </TabsContent>

          {/* ── Link tab ─────────────────────── */}
          <TabsContent value="link" className="mt-4 space-y-4">
            {linkable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tu n'as pas d'objectif libre à lier.
              </p>
            ) : (
              <div className="space-y-2">
                {linkable.map((obj) => (
                  <Label
                    key={obj.id}
                    htmlFor={`obj-${obj.id}`}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-muted/40 transition"
                  >
                    <Checkbox
                      id={`obj-${obj.id}`}
                      checked={selectedObjIds.has(obj.id)}
                      onCheckedChange={(checked) => {
                        setSelectedObjIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(obj.id);
                          else next.delete(obj.id);
                          return next;
                        });
                      }}
                      className="mt-0.5"
                    />
                    <ObjectiveSummary obj={obj} competitionNameById={competitionNameById} />
                  </Label>
                ))}
              </div>
            )}

            <Button
              type="button"
              className="w-full h-11"
              onClick={handleLink}
              disabled={selectedObjIds.size === 0 || isPending}
            >
              {linkMut.isPending
                ? "Liaison..."
                : selectedObjIds.size <= 1
                  ? "Lier à cette compétition"
                  : `Lier ${selectedObjIds.size} objectifs à cette compétition`}
            </Button>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function ObjectiveSummary({
  obj,
  competitionNameById,
}: {
  obj: Objective;
  competitionNameById: Map<string, string>;
}) {
  const lines: string[] = [];
  if (obj.event_code) {
    const target =
      obj.target_time_seconds != null
        ? formatTime(obj.target_time_seconds)
        : null;
    lines.push(
      target
        ? `${eventLabel(obj.event_code)} — cible ${target}`
        : eventLabel(obj.event_code),
    );
  }
  if (obj.text) lines.push(obj.text);
  if (lines.length === 0) lines.push("(objectif vide)");

  const linkedNames = obj.competition_ids
    .map((cid) => competitionNameById.get(cid))
    .filter((n): n is string => Boolean(n));

  return (
    <div className="min-w-0 flex-1 text-xs">
      {lines.map((l, i) => (
        <p
          key={i}
          className={
            i === 0 ? "font-medium truncate" : "text-muted-foreground truncate"
          }
        >
          {l}
        </p>
      ))}
      {linkedNames.length > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground/80 truncate">
          Déjà lié à : {linkedNames.join(", ")}
        </p>
      )}
    </div>
  );
}
