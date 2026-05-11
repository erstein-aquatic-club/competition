import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllAssignments, assignSwimmer, unassignSwimmer, reassignSwimmer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { AthleteSummary, CoachSwimmerAssignment } from "@/lib/api/types";
import CoachSectionHeader from "./CoachSectionHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, UserPlus, UserMinus, Users, UserRoundPlus, Pencil, Trash2 } from "lucide-react";
import { useMyTeam } from "@/hooks/useMyTeam";
import { ManualSwimmerDialog } from "@/components/coach/ManualSwimmerDialog";
import { AddSwimmerToTeamDialog } from "@/components/coach/AddSwimmerToTeamDialog";
import { deleteManualSwimmer } from "@/lib/api/coach-manual-swimmers";
import type { CoachManualSwimmer } from "@/lib/api/coach-manual-swimmers";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoachMySwimmersScreenProps {
  athletes: AthleteSummary[];
  athletesLoading: boolean;
  onBack: () => void;
}

interface CoachInfo {
  id: number;
  display_name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function SwimmerAvatar({ athlete }: { athlete: AthleteSummary }) {
  if (athlete.avatar_url) {
    return (
      <img
        src={athlete.avatar_url}
        alt=""
        className="h-10 w-10 rounded-full object-cover border border-border flex-shrink-0"
      />
    );
  }
  return (
    <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
      {getInitials(athlete.display_name)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach View — SwimmerRow
// ---------------------------------------------------------------------------

function SwimmerRow({
  athlete,
  actionLabel,
  actionVariant,
  actionIcon: ActionIcon,
  onAction,
  isPending,
}: {
  athlete: AthleteSummary;
  actionLabel: string;
  actionVariant: "default" | "destructive" | "outline";
  actionIcon: typeof UserPlus;
  onAction: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30">
      <SwimmerAvatar athlete={athlete} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{athlete.display_name}</p>
        {athlete.group_label && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">
            {athlete.group_label}
          </Badge>
        )}
      </div>
      <Button
        variant={actionVariant}
        size="sm"
        onClick={onAction}
        disabled={isPending}
        className="flex-shrink-0 gap-1.5"
      >
        <ActionIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{actionLabel}</span>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin View — AdminSwimmerRow
// ---------------------------------------------------------------------------

function AdminSwimmerRow({
  athlete,
  currentCoachId,
  coaches,
  onReassign,
  onUnassign,
  isPending,
}: {
  athlete: AthleteSummary;
  currentCoachId: number | null;
  coaches: CoachInfo[];
  onReassign: (swimmerId: number, newCoachId: number) => void;
  onUnassign: (swimmerId: number) => void;
  isPending: boolean;
}) {
  const handleValueChange = (val: string) => {
    if (athlete.id == null) return;
    if (val === "__unassign__") {
      onUnassign(athlete.id);
    } else {
      onReassign(athlete.id, Number(val));
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30">
      <SwimmerAvatar athlete={athlete} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{athlete.display_name}</p>
        {athlete.group_label && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">
            {athlete.group_label}
          </Badge>
        )}
      </div>
      <Select
        value={currentCoachId != null ? String(currentCoachId) : "__unassign__"}
        onValueChange={handleValueChange}
        disabled={isPending}
      >
        <SelectTrigger className="w-40 flex-shrink-0 text-xs">
          <SelectValue placeholder="Coach..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unassign__">Non attribué</SelectItem>
          {coaches.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deep-link helper (exported for unit tests)
// ---------------------------------------------------------------------------

export function parseDeepLinkAction(hash: string): { action: string | null; cleanPath: string } {
  const qIdx = hash.indexOf("?");
  const params = new URLSearchParams(qIdx >= 0 ? hash.slice(qIdx) : "");
  const action = params.get("action");
  params.delete("action");
  const pathPart = (qIdx >= 0 ? hash.slice(0, qIdx) : hash).replace(/^#/, "");
  const query = params.toString();
  return { action, cleanPath: query ? `${pathPart}?${query}` : pathPart };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CoachMySwimmersScreen({
  athletes,
  athletesLoading,
  onBack,
}: CoachMySwimmersScreenProps) {
  const role = useAuth((s) => s.role);
  const userId = useAuth((s) => s.userId);
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [removingSwimmer, setRemovingSwimmer] = useState<AthleteSummary | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingManual, setEditingManual] = useState<CoachManualSwimmer | undefined>(undefined);

  // Deep-link: ?action=new-manual opens ManualSwimmerDialog on mount
  useEffect(() => {
    const { action, cleanPath } = parseDeepLinkAction(window.location.hash);
    if (action !== "new-manual") return;
    setManualDialogOpen(true);
    setEditingManual(undefined);
    navigate(cleanPath, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data fetching ────────────────────────────────────────────

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["all-assignments"],
    queryFn: () => getAllAssignments(),
  });

  const { data: coaches = [] } = useQuery<CoachInfo[]>({
    queryKey: ["coaches-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("id, display_name")
        .in("role", ["coach", "admin"]);
      return (data ?? []) as CoachInfo[];
    },
    enabled: isAdmin,
  });

  // ── Mutations ────────────────────────────────────────────────

  // ── useMyTeam (coach-only) ───────────────────────────────────
  const { team, accounts: teamAccounts, manuals: teamManuals } = useMyTeam(isAdmin ? [] : athletes);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteManualSwimmer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-manual-swimmers"] });
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
    },
  });

  const invalidateKeys = () => {
    queryClient.invalidateQueries({ queryKey: ["all-assignments"] });
    queryClient.invalidateQueries({ queryKey: ["my-swimmer-ids", userId] });
    queryClient.invalidateQueries({ queryKey: ["athletes"] });
  };

  const assignMutation = useMutation({
    mutationFn: ({ swimmerId, coachId }: { swimmerId: number; coachId: number }) =>
      assignSwimmer(swimmerId, coachId, userId ?? 0),
    onSuccess: invalidateKeys,
    onError: (err: Error, vars) => {
      toast.error("Échec attribution nageur", {
        description: err.message,
        action: { label: "Réessayer", onClick: () => assignMutation.mutate(vars) },
      });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: (swimmerId: number) => unassignSwimmer(swimmerId),
    onSuccess: invalidateKeys,
    onError: (err: Error, vars) => {
      toast.error("Échec retrait nageur", {
        description: err.message,
        action: { label: "Réessayer", onClick: () => unassignMutation.mutate(vars) },
      });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({ swimmerId, newCoachId }: { swimmerId: number; newCoachId: number }) =>
      reassignSwimmer(swimmerId, newCoachId, userId ?? 0),
    onSuccess: invalidateKeys,
    onError: (err: Error, vars) => {
      toast.error("Échec réattribution nageur", {
        description: err.message,
        action: { label: "Réessayer", onClick: () => reassignMutation.mutate(vars) },
      });
    },
  });

  const isPending =
    assignMutation.isPending || unassignMutation.isPending || reassignMutation.isPending;

  // ── Derived data ─────────────────────────────────────────────

  const assignmentMap = useMemo(() => {
    const map = new Map<number, CoachSwimmerAssignment>();
    for (const a of assignments) map.set(a.swimmer_id, a);
    return map;
  }, [assignments]);

  const filteredAthletes = useMemo(() => {
    if (!search.trim()) return athletes;
    const q = search.toLowerCase().trim();
    return athletes.filter((a) => a.display_name.toLowerCase().includes(q));
  }, [athletes, search]);

  // ── Coach view derivations ───────────────────────────────────

  const mySwimmers = useMemo(
    () => filteredAthletes.filter((a) => a.id != null && assignmentMap.get(a.id)?.coach_id === userId),
    [filteredAthletes, assignmentMap, userId],
  );

  const availableSwimmers = useMemo(
    () => filteredAthletes.filter((a) => a.id != null && !assignmentMap.has(a.id)),
    [filteredAthletes, assignmentMap],
  );

  // ── Admin view derivations ───────────────────────────────────

  const coachMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of coaches) m.set(c.id, c.display_name);
    return m;
  }, [coaches]);

  const swimmersByCoach = useMemo(() => {
    if (!isAdmin) return new Map<number | null, AthleteSummary[]>();
    const groups = new Map<number | null, AthleteSummary[]>();

    for (const athlete of filteredAthletes) {
      const assignment = athlete.id != null ? assignmentMap.get(athlete.id) : undefined;
      const coachId = assignment?.coach_id ?? null;
      const list = groups.get(coachId) ?? [];
      list.push(athlete);
      groups.set(coachId, list);
    }

    // Sort each group alphabetically
    for (const [, list] of groups) {
      list.sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"));
    }
    return groups;
  }, [isAdmin, filteredAthletes, assignmentMap]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleAssign = (swimmerId: number) => {
    if (userId == null) return;
    assignMutation.mutate({ swimmerId, coachId: userId });
  };

  const handleConfirmRemove = () => {
    if (removingSwimmer?.id == null) return;
    unassignMutation.mutate(removingSwimmer.id, {
      onSettled: () => setRemovingSwimmer(null),
    });
  };

  const handleAdminReassign = (swimmerId: number, newCoachId: number) => {
    // If swimmer is already assigned, reassign; otherwise assign
    if (assignmentMap.has(swimmerId)) {
      reassignMutation.mutate({ swimmerId, newCoachId });
    } else {
      assignMutation.mutate({ swimmerId, coachId: newCoachId });
    }
  };

  const handleAdminUnassign = (swimmerId: number) => {
    if (assignmentMap.has(swimmerId)) {
      unassignMutation.mutate(swimmerId);
    }
  };

  // ── Loading state ────────────────────────────────────────────

  const isLoading = athletesLoading || assignmentsLoading;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-5 pb-6">
      <CoachSectionHeader
        title="Mon équipe"
        description={
          isLoading
            ? "Chargement..."
            : isAdmin
            ? `${athletes.length} nageur${athletes.length !== 1 ? "s" : ""} — vue admin`
            : `${team.length} nageur${team.length !== 1 ? "s" : ""} dans ton équipe`
        }
        onBack={onBack}
        actions={
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4" />
          </div>
        }
      />

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Rechercher un nageur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-10 w-10 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
              <div className="h-8 w-20 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* ── Coach View ───────────────────────────────────────── */}
      {!isLoading && !isAdmin && (
        <div className="space-y-4">
            {/* CTA unifié : ajout nageur (compte du club ou sans compte) */}
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={() => setAddDialogOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Ajouter un nageur à mon équipe
            </Button>

            {/* Nageurs avec compte */}
            {teamAccounts.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                    Avec compte
                  </h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {teamAccounts.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {mySwimmers.map((athlete) => (
                    <SwimmerRow
                      key={athlete.id}
                      athlete={athlete}
                      actionLabel="Retirer"
                      actionVariant="destructive"
                      actionIcon={UserMinus}
                      onAction={() => setRemovingSwimmer(athlete)}
                      isPending={isPending}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Nageurs sans compte (manuels) */}
            {teamManuals.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                    Sans compte
                  </h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {teamManuals.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {teamManuals.map((m) => {
                    const raw = assignments.find(() => false); // manual swimmers have no assignment
                    void raw;
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="h-10 w-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {m.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{m.displayName}</p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5 text-muted-foreground">
                            Sans compte
                          </Badge>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Modifier ${m.displayName}`}
                            onClick={() => {
                              const raw = { id: m.manualId!, coach_id: "", display_name: m.displayName, birthdate: m.birthdate ?? null, sex: m.sex ?? null, created_at: "" };
                              setEditingManual(raw);
                              setManualDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={`Supprimer ${m.displayName}`}
                            disabled={deleteMutation.isPending}
                            onClick={() => m.manualId && deleteMutation.mutate(m.manualId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {team.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {search ? "Aucun nageur correspondant." : "Votre équipe est vide. Ajoutez des nageurs ci-dessus."}
              </p>
            )}
        </div>
      )}

      {/* ── Admin View ───────────────────────────────────────── */}
      {!isLoading && isAdmin && (
        <>
          {/* Grouped by coach */}
          {coaches
            .sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"))
            .map((coach) => {
              const list = swimmersByCoach.get(coach.id) ?? [];
              if (list.length === 0 && search) return null;
              return (
                <section key={coach.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-eyebrow text-muted-foreground">
                      {coach.display_name}
                    </h3>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {list.length}
                    </Badge>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2 text-center">
                      Aucun nageur.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {list.map((athlete) => (
                        <AdminSwimmerRow
                          key={athlete.id}
                          athlete={athlete}
                          currentCoachId={coach.id}
                          coaches={coaches}
                          onReassign={handleAdminReassign}
                          onUnassign={handleAdminUnassign}
                          isPending={isPending}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

          {/* Unassigned */}
          {(() => {
            const unassigned = swimmersByCoach.get(null) ?? [];
            return (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-eyebrow text-amber-600 dark:text-amber-400">
                    Non attribués
                  </h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {unassigned.length}
                  </Badge>
                </div>
                {unassigned.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">
                    Tous les nageurs sont attribués.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {unassigned.map((athlete) => (
                      <AdminSwimmerRow
                        key={athlete.id}
                        athlete={athlete}
                        currentCoachId={null}
                        coaches={coaches}
                        onReassign={handleAdminReassign}
                        onUnassign={handleAdminUnassign}
                        isPending={isPending}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })()}
        </>
      )}

      {/* ── Manual swimmer dialog (édition uniquement post-§186) ─ */}
      <ManualSwimmerDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        swimmer={editingManual}
      />

      {/* ── Add swimmer to team dialog (création unifiée) ───── */}
      <AddSwimmerToTeamDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        availableSwimmers={availableSwimmers}
        onAssignAccount={(id) => {
          handleAssign(id);
          setAddDialogOpen(false);
        }}
        isAssigning={assignMutation.isPending}
      />

      {/* ── Remove confirmation dialog ──────────────────────── */}
      <AlertDialog
        open={removingSwimmer != null}
        onOpenChange={(open) => {
          if (!open) setRemovingSwimmer(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce nageur ?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingSwimmer?.display_name} ne sera plus dans votre liste de nageurs.
              Vous pourrez le reprendre en charge plus tard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassignMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemove}
              disabled={unassignMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unassignMutation.isPending ? "Retrait..." : "Retirer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
