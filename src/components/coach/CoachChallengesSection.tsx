import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAllChallenges, createChallenge, updateChallengeProgress, deleteChallenge } from "@/lib/api/challenges";
import type { Challenge, GroupSummary } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { ChallengeProgressBar } from "@/components/shared/ChallengeProgressBar";

interface CoachChallengesSectionProps {
  groups: GroupSummary[];
}

const TYPE_OPTIONS = [
  { value: "attendance", label: "Assiduité" },
  { value: "wellness", label: "Bien-être" },
  { value: "custom", label: "Défi personnalisé" },
] as const;

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function CoachChallengesSection({ groups }: CoachChallengesSectionProps) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProgressId, setEditProgressId] = useState<string | null>(null);
  const [editProgressValue, setEditProgressValue] = useState("");

  // Form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Challenge["type"]>("custom");
  const [target, setTarget] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [groupId, setGroupId] = useState<string>("all");

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ["all-challenges"],
    queryFn: () => getAllChallenges(),
  });

  const createMut = useMutation({
    mutationFn: (data: Omit<Challenge, "id" | "current_value" | "created_at">) =>
      createChallenge(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-challenges"] });
      queryClient.invalidateQueries({ queryKey: ["active-challenges"] });
      toast("Challenge créé");
      resetForm();
      setDialogOpen(false);
    },
    onError: () => toast.error("Erreur", { description: "Impossible de créer le challenge." }),
  });

  const updateProgressMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) =>
      updateChallengeProgress(id, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-challenges"] });
      queryClient.invalidateQueries({ queryKey: ["active-challenges"] });
      setEditProgressId(null);
      toast("Progression mise à jour");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChallenge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-challenges"] });
      queryClient.invalidateQueries({ queryKey: ["active-challenges"] });
      toast("Challenge supprimé");
    },
  });

  function resetForm() {
    setTitle("");
    setType("custom");
    setTarget("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate("");
    setGroupId("all");
  }

  function handleCreate() {
    if (!title.trim() || !target || !endDate || !userId) return;
    createMut.mutate({
      coach_id: userId,
      group_id: groupId === "all" ? null : Number(groupId),
      title: title.trim(),
      type,
      target: Number(target),
      start_date: startDate,
      end_date: endDate,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const activeChallenges = challenges.filter((c) => c.end_date >= today);
  const pastChallenges = challenges.filter((c) => c.end_date < today);

  const permanentGroups = groups.filter((g) => !g.is_temporary);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Challenges d'équipe</h2>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Créer un challenge
        </Button>
      </div>

      {isLoading && (
        <p className="text-xs text-muted-foreground text-center py-6">Chargement...</p>
      )}

      {/* Active challenges */}
      {activeChallenges.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">En cours</p>
          {activeChallenges.map((ch) => (
            <div key={ch.id} className="space-y-1">
              <ChallengeProgressBar challenge={ch} />
              <div className="flex items-center gap-1 px-1">
                {ch.group_id ? (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {permanentGroups.find((g) => g.id === ch.group_id)?.name ?? `Groupe ${ch.group_id}`}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    Tout le club
                  </Badge>
                )}
                <div className="flex-1" />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => {
                    setEditProgressId(ch.id);
                    setEditProgressValue(String(ch.current_value));
                  }}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Progression
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm("Supprimer ce challenge ?")) deleteMut.mutate(ch.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Inline progress editor */}
              {editProgressId === ch.id && (
                <div className="flex items-center gap-2 px-1 pb-1">
                  <Input
                    type="number"
                    value={editProgressValue}
                    onChange={(e) => setEditProgressValue(e.target.value)}
                    className="h-7 w-24 text-xs"
                    min={0}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const v = Number(editProgressValue);
                      if (Number.isFinite(v) && v >= 0) {
                        updateProgressMut.mutate({ id: ch.id, value: v });
                      }
                    }}
                  >
                    OK
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setEditProgressId(null)}
                  >
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Past challenges */}
      {pastChallenges.length > 0 && (
        <details className="group">
          <summary className="text-xs font-medium text-muted-foreground uppercase tracking-wide cursor-pointer select-none py-1">
            Terminés ({pastChallenges.length})
          </summary>
          <div className="mt-2 space-y-2">
            {pastChallenges.map((ch) => (
              <div key={ch.id} className="opacity-60">
                <ChallengeProgressBar challenge={ch} />
                <div className="flex items-center gap-1 px-1 mt-1">
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {ch.group_id
                      ? permanentGroups.find((g) => g.id === ch.group_id)?.name ?? `Groupe ${ch.group_id}`
                      : "Tout le club"}
                  </Badge>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Supprimer ce challenge ?")) deleteMut.mutate(ch.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {!isLoading && challenges.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6">
          Aucun challenge pour le moment. Créez-en un pour motiver vos nageurs !
        </p>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau challenge</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="ch-title" className="text-xs">Titre</Label>
              <Input
                id="ch-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: 100% de présence en mars"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as Challenge["type"])}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="ch-target" className="text-xs">Objectif (nombre)</Label>
              <Input
                id="ch-target"
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Ex: 20"
                className="mt-1"
                min={1}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="ch-start" className="text-xs">Début</Label>
                <Input
                  id="ch-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ch-end" className="text-xs">Fin</Label>
                <Input
                  id="ch-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Groupe cible</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tout le club</SelectItem>
                  {permanentGroups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!title.trim() || !target || !endDate || createMut.isPending}
            >
              {createMut.isPending ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
