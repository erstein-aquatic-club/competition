import React, { useState, useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createManualSwimmer } from "@/lib/api/coach-manual-swimmers";
import type { AthleteSummary } from "@/lib/api/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Comptes du club non encore rattachés à un coach (la team courante ou autre). */
  availableSwimmers: AthleteSummary[];
  /** Appelé quand le coach clique pour rattacher un compte du club. */
  onAssignAccount: (swimmerId: number) => void;
  /** True quand une assignation est en cours (pour disable les boutons). */
  isAssigning?: boolean;
}

export function AddSwimmerToTeamDialog({
  open,
  onOpenChange,
  availableSwimmers,
  onAssignAccount,
  isAssigning = false,
}: Props) {
  const [tab, setTab] = useState<"club" | "manual">("club");

  // ── Tab "Du club" ─────────────────────────────────────────
  const [clubSearch, setClubSearch] = useState("");
  const debouncedClubSearch = useDebouncedValue(clubSearch, 200);
  const filteredAvailable = useMemo(() => {
    const q = debouncedClubSearch.trim().toLowerCase();
    if (!q) return availableSwimmers;
    return availableSwimmers.filter((a) =>
      (a.display_name ?? "").toLowerCase().includes(q),
    );
  }, [availableSwimmers, debouncedClubSearch]);

  // ── Tab "Sans compte" ─────────────────────────────────────
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [birthdate, setBirthdate] = useState("");
  const isManualValid = name.trim().length > 0 && (sex === "M" || sex === "F");

  const resetManual = () => {
    setName("");
    setSex("");
    setBirthdate("");
  };

  const createManualMutation = useMutation({
    mutationFn: () =>
      createManualSwimmer(name.trim(), {
        sex: sex as "M" | "F",
        birthdate: birthdate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-manual-swimmers"] });
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
      toast("Nageur ajouté à votre équipe");
      resetManual();
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManualValid) return;
    createManualMutation.mutate();
  };

  // Reset state on open close
  React.useEffect(() => {
    if (!open) {
      setTab("club");
      setClubSearch("");
      resetManual();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un nageur à mon équipe</DialogTitle>
          <DialogDescription>
            Choisis un compte existant du club ou crée un nageur sans compte.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "club" | "manual")} className="space-y-4">
          <TabsList className="w-full">
            <TabsTrigger value="club" className="flex-1 gap-1.5">
              Compte du club
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {availableSwimmers.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">
              Sans compte
            </TabsTrigger>
          </TabsList>

          {/* ── Tab Club ─────────────────────────────────────── */}
          <TabsContent value="club" className="space-y-3 mt-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Rechercher un nageur..."
                value={clubSearch}
                onChange={(e) => setClubSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {filteredAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {clubSearch
                  ? "Aucun nageur correspondant."
                  : "Tous les nageurs du club sont déjà pris en charge."}
              </p>
            ) : (
              <div className="max-h-[280px] overflow-y-auto space-y-1">
                {filteredAvailable.map((athlete) => (
                  <div
                    key={athlete.id}
                    className="flex items-center gap-3 rounded-md border border-border/30 p-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{athlete.display_name}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => athlete.id != null && onAssignAccount(athlete.id)}
                      disabled={isAssigning}
                      className="gap-1.5"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Rattacher
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Tab Sans compte ──────────────────────────────── */}
          <TabsContent value="manual" className="space-y-4 mt-0">
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="add-name">Nom</Label>
                <Input
                  id="add-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Lucas Martin"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Sexe</Label>
                <div className="flex gap-2">
                  {(["M", "F"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={sex === s ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSex(s)}
                      className="flex-1"
                    >
                      {s === "M" ? "Masculin" : "Féminin"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-birthdate">
                  Date de naissance <span className="text-muted-foreground text-xs">(optionnel)</span>
                </Label>
                <Input
                  id="add-birthdate"
                  type="date"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={createManualMutation.isPending}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={!isManualValid || createManualMutation.isPending}
                >
                  {createManualMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Créer le nageur
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
