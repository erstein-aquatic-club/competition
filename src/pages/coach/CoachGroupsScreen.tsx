import { useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTemporaryGroup,
  addTemporaryGroupMembers,
  getTemporaryGroupDetail,
  removeTemporaryGroupMember,
  getTemporaryGroups,
  deactivateTemporaryGroup,
  reactivateTemporaryGroup,
  deleteTemporaryGroup,
} from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  UsersRound,
  RotateCcw,
  Power,
} from "lucide-react";
import CoachSectionHeader from "./CoachSectionHeader";
import type {
  TemporaryGroupSummary,
  TemporaryGroupDetail,
} from "@/lib/api/types";

type CoachGroupsScreenProps = {
  onBack?: () => void;
  athletes: Array<{
    id: number | null;
    display_name: string;
    group_label?: string | null;
  }>;
  groups: Array<{ id: number | string; name: string }>;
  athletesLoading: boolean;
};

type ViewMode = "list" | "detail";

// ── Swimmer Picker ──────────────────────────────────────────────

type SwimmerPickerProps = {
  athletes: Array<{
    id: number | null;
    display_name: string;
    group_label?: string | null;
  }>;
  selected: Set<number>;
  onToggle: (userId: number) => void;
  filterToUserIds?: Set<number> | null;
};

const SwimmerPicker = ({
  athletes,
  selected,
  onToggle,
  filterToUserIds,
}: SwimmerPickerProps) => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);

  const filtered = useMemo(() => {
    let list = athletes.filter((a) => a.id != null);
    if (filterToUserIds) {
      list = list.filter((a) => filterToUserIds.has(a.id!));
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((a) => a.display_name.toLowerCase().includes(q));
    }
    return list;
  }, [athletes, filterToUserIds, debouncedSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const a of filtered) {
      const label = a.group_label || "Sans groupe";
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(a);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
  }, [filtered]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Rechercher un nageur..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-[50dvh] overflow-y-auto space-y-3">
        {grouped.map(([groupLabel, groupAthletes]) => (
          <div key={groupLabel}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              {groupLabel}
            </p>
            <div className="space-y-1">
              {groupAthletes.map((a) => (
                <label
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selected.has(a.id!)}
                    onCheckedChange={() => onToggle(a.id!)}
                  />
                  <span className="text-sm">{a.display_name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun nageur trouvé.
          </p>
        )}
      </div>
      {selected.size > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.size} nageur{selected.size > 1 ? "s" : ""}{" "}
          sélectionné{selected.size > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
};

// ── Create Group Sheet ──────────────────────────────────────────

type CreateGroupSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athletes: Array<{
    id: number | null;
    display_name: string;
    group_label?: string | null;
  }>;
  parentGroupId?: number | null;
  parentMembers?: Set<number> | null;
  onCreated: () => void;
};

const CreateGroupSheet = ({
  open,
  onOpenChange,
  athletes,
  parentGroupId,
  parentMembers,
  onCreated,
}: CreateGroupSheetProps) => {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleMember = (userId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createTemporaryGroup({
        name: name.trim(),
        member_user_ids: [...selected],
        parent_group_id: parentGroupId ?? undefined,
      }),
    onSuccess: () => {
      toast("Groupe créé", { description: `Le groupe "${name.trim()}" a été créé avec ${selected.size} nageur${selected.size > 1 ? "s" : ""}.` });
      setName("");
      setSelected(new Set());
      onOpenChange(false);
      onCreated();
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Nom requis", { description: "Veuillez saisir un nom pour le groupe." });
      return;
    }
    createMutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {parentGroupId ? "Créer un sous-groupe" : "Créer un groupe"}
          </SheetTitle>
          <SheetDescription>
            {parentGroupId
              ? "Sélectionnez des nageurs du groupe parent pour ce sous-groupe."
              : "Créez un groupe temporaire (stage, compétition) avec des nageurs de différents groupes."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Nom du groupe</Label>
            <Input
              id="group-name"
              placeholder="Ex : Stage Pâques 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Nageurs</Label>
            <SwimmerPicker
              athletes={athletes}
              selected={selected}
              onToggle={toggleMember}
              filterToUserIds={parentMembers ?? null}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={createMutation.isPending || !name.trim()}
          >
            {createMutation.isPending ? "Création..." : "Créer le groupe"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ── Add Members Sheet ───────────────────────────────────────────

type AddMembersSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number;
  athletes: Array<{
    id: number | null;
    display_name: string;
    group_label?: string | null;
  }>;
  existingMemberIds: Set<number>;
  onAdded: () => void;
};

const AddMembersSheet = ({
  open,
  onOpenChange,
  groupId,
  athletes,
  existingMemberIds,
  onAdded,
}: AddMembersSheetProps) => {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const availableAthletes = useMemo(
    () => athletes.filter((a) => a.id != null && !existingMemberIds.has(a.id)),
    [athletes, existingMemberIds],
  );

  const toggleMember = (userId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const addMutation = useMutation({
    mutationFn: () => addTemporaryGroupMembers(groupId, [...selected]),
    onSuccess: () => {
      toast("Nageurs ajoutés", { description: `${selected.size} nageur${selected.size > 1 ? "s" : ""} ajouté${selected.size > 1 ? "s" : ""}.` });
      setSelected(new Set());
      onOpenChange(false);
      onAdded();
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ajouter des nageurs</SheetTitle>
          <SheetDescription>
            Sélectionnez les nageurs à ajouter au groupe.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <SwimmerPicker
            athletes={availableAthletes}
            selected={selected}
            onToggle={toggleMember}
          />
          <Button
            className="w-full"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || selected.size === 0}
          >
            {addMutation.isPending
              ? "Ajout..."
              : `Ajouter ${selected.size} nageur${selected.size > 1 ? "s" : ""}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ── Group Detail View ───────────────────────────────────────────

type GroupDetailViewProps = {
  groupId: number;
  athletes: Array<{
    id: number | null;
    display_name: string;
    group_label?: string | null;
  }>;
  onBack: () => void;
};

const GroupDetailView = ({
  groupId,
  athletes,
  onBack,
}: GroupDetailViewProps) => {
  const queryClient = useQueryClient();
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showCreateSub, setShowCreateSub] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{
    userId: number;
    name: string;
  } | null>(null);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["temp-group-detail", groupId],
    queryFn: () => getTemporaryGroupDetail(groupId),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) =>
      removeTemporaryGroupMember(groupId, userId),
    onSuccess: () => {
      toast("Nageur retiré");
      void queryClient.invalidateQueries({
        queryKey: ["temp-group-detail", groupId],
      });
      void queryClient.invalidateQueries({ queryKey: ["temp-groups"] });
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const handleInvalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["temp-group-detail", groupId],
    });
    void queryClient.invalidateQueries({ queryKey: ["temp-groups"] });
  };

  const existingMemberIds = useMemo(
    () => new Set((detail?.members ?? []).map((m) => m.user_id)),
    [detail],
  );

  const parentMemberIds = useMemo(
    () => new Set((detail?.members ?? []).map((m) => m.user_id)),
    [detail],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux groupes
        </Button>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-4 w-32 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux groupes
        </Button>
        <p className="text-sm text-muted-foreground text-center py-8">
          Groupe introuvable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux groupes
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {detail.name}
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant={detail.is_active ? "default" : "secondary"}>
            {detail.is_active ? "Actif" : "Terminé"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {detail.members.length} membre{detail.members.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Members */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground">
            Membres
          </h3>
          {detail.is_active && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddMembers(true)}
            >
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Ajouter
            </Button>
          )}
        </div>
        {detail.members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun membre dans ce groupe.
          </p>
        ) : (
          <div className="space-y-1.5">
            {detail.members.map((m) => (
              <div
                key={m.user_id}
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {m.display_name}
                  </p>
                  {m.permanent_group_label && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 mt-0.5"
                    >
                      {m.permanent_group_label}
                    </Badge>
                  )}
                </div>
                {detail.is_active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setConfirmRemove({
                        userId: m.user_id,
                        name: m.display_name,
                      })
                    }
                    aria-label="Retirer du groupe"
                  >
                    <UserMinus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-groups */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground">
            Sous-groupes
          </h3>
          {detail.is_active && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCreateSub(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Sous-groupe
            </Button>
          )}
        </div>
        {detail.subgroups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun sous-groupe.
          </p>
        ) : (
          <div className="space-y-2">
            {detail.subgroups.map((sg) => (
              <Collapsible key={sg.id}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border bg-card p-3 text-left hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <UsersRound className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{sg.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {sg.members.length}
                    </Badge>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-4 mt-1 space-y-1">
                    {sg.members.map((m) => (
                      <div
                        key={m.user_id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2"
                      >
                        <span className="text-sm">{m.display_name}</span>
                      </div>
                    ))}
                    {sg.members.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">
                        Aucun membre.
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </div>

      {/* Add Members Sheet */}
      <AddMembersSheet
        open={showAddMembers}
        onOpenChange={setShowAddMembers}
        groupId={groupId}
        athletes={athletes}
        existingMemberIds={existingMemberIds}
        onAdded={handleInvalidate}
      />

      {/* Create Sub-group Sheet */}
      <CreateGroupSheet
        open={showCreateSub}
        onOpenChange={setShowCreateSub}
        athletes={athletes}
        parentGroupId={groupId}
        parentMembers={parentMemberIds}
        onCreated={handleInvalidate}
      />

      {/* Remove Member Confirmation */}
      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer du groupe</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous retirer {confirmRemove?.name} de ce groupe ?
              {detail.subgroups.length > 0
                ? " Le nageur sera aussi retiré des sous-groupes."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemove) {
                  removeMutation.mutate(confirmRemove.userId);
                  setConfirmRemove(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── Group Card ──────────────────────────────────────────────────

type GroupCardProps = {
  group: TemporaryGroupSummary;
  onManage: (groupId: number) => void;
  onDeactivate: (groupId: number) => void;
  onReactivate: (groupId: number) => void;
  onDelete: (groupId: number) => void;
};

const GroupCard = ({
  group,
  onManage,
  onDeactivate,
  onReactivate,
  onDelete,
}: GroupCardProps) => {
  const createdDate = new Date(group.created_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{group.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {group.member_count} membre{group.member_count !== 1 ? "s" : ""}
            </span>
            {group.subgroup_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {group.subgroup_count} sous-groupe
                {group.subgroup_count !== 1 ? "s" : ""}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {createdDate}
            </span>
          </div>
        </div>
        <Badge variant={group.is_active ? "default" : "secondary"}>
          {group.is_active ? "Actif" : "Terminé"}
        </Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {group.is_active ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onManage(group.id)}>
              <Settings className="mr-1.5 h-3.5 w-3.5" />
              Gérer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDeactivate(group.id)}
            >
              <Power className="mr-1.5 h-3.5 w-3.5" />
              Terminer
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReactivate(group.id)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Réactiver
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(group.id)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Supprimer
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────

const CoachGroupsScreen = ({
  onBack,
  athletes,
  athletesLoading,
}: CoachGroupsScreenProps) => {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<number | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const { data: tempGroups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["temp-groups"],
    queryFn: () => getTemporaryGroups(),
  });

  const activeGroups = useMemo(
    () => tempGroups.filter((g) => g.is_active),
    [tempGroups],
  );
  const inactiveGroups = useMemo(
    () => tempGroups.filter((g) => !g.is_active),
    [tempGroups],
  );

  const deactivateMutation = useMutation({
    mutationFn: (groupId: number) => deactivateTemporaryGroup(groupId),
    onSuccess: () => {
      toast("Groupe terminé");
      void queryClient.invalidateQueries({ queryKey: ["temp-groups"] });
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (groupId: number) => reactivateTemporaryGroup(groupId),
    onSuccess: () => {
      toast("Groupe réactivé");
      void queryClient.invalidateQueries({ queryKey: ["temp-groups"] });
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (groupId: number) => deleteTemporaryGroup(groupId),
    onSuccess: () => {
      toast("Groupe supprimé");
      void queryClient.invalidateQueries({ queryKey: ["temp-groups"] });
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const handleManage = (groupId: number) => {
    setSelectedGroupId(groupId);
    setViewMode("detail");
  };

  const handleBackToList = () => {
    setSelectedGroupId(null);
    setViewMode("list");
    void queryClient.invalidateQueries({ queryKey: ["temp-groups"] });
  };

  // ── Detail view ──
  if (viewMode === "detail" && selectedGroupId != null) {
    return (
      <GroupDetailView
        groupId={selectedGroupId}
        athletes={athletes}
        onBack={handleBackToList}
      />
    );
  }

  // ── List view ──
  return (
    <div className="space-y-6 pb-24">
      <CoachSectionHeader
        title="Groupes temporaires"
        description="Créez et gérez des groupes pour les stages, compétitions ou événements."
        onBack={onBack}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer un groupe
          </Button>
        }
      />

      {groupsLoading || athletesLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-4 animate-pulse motion-reduce:animate-none"
            >
              <div className="flex items-center gap-3">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="ml-auto h-6 w-16 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : tempGroups.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <Users className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Aucun groupe temporaire pour le moment.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer le premier groupe
          </Button>
        </div>
      ) : (
        <>
          {/* Active groups */}
          {activeGroups.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground">
                Actifs ({activeGroups.length})
              </h3>
              {activeGroups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  onManage={handleManage}
                  onDeactivate={(id) => setConfirmDeactivate(id)}
                  onReactivate={(id) => reactivateMutation.mutate(id)}
                  onDelete={(id) => setConfirmDelete(id)}
                />
              ))}
            </div>
          )}

          {/* Inactive groups */}
          {inactiveGroups.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground">
                Terminés ({inactiveGroups.length})
              </h3>
              {inactiveGroups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  onManage={handleManage}
                  onDeactivate={(id) => setConfirmDeactivate(id)}
                  onReactivate={(id) => reactivateMutation.mutate(id)}
                  onDelete={(id) => setConfirmDelete(id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Group Sheet */}
      <CreateGroupSheet
        open={showCreate}
        onOpenChange={setShowCreate}
        athletes={athletes}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ["temp-groups"] });
        }}
      />

      {/* Deactivate Confirmation */}
      <AlertDialog
        open={confirmDeactivate != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeactivate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminer le groupe</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous marquer ce groupe comme terminé ? Les sous-groupes seront aussi désactivés.
              Vous pourrez le réactiver plus tard si nécessaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeactivate != null) {
                  deactivateMutation.mutate(confirmDeactivate);
                  setConfirmDeactivate(null);
                }
              }}
            >
              Terminer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={confirmDelete != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le groupe</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le groupe et tous ses sous-groupes seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete != null) {
                  deleteMutation.mutate(confirmDelete);
                  setConfirmDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CoachGroupsScreen;
