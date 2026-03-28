import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dumbbell, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";

interface AddSessionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetFolderId: number;
  cycleName: string;
  athleteName: string;
  onCreateNew: () => void;
}

export function AddSessionSheet({
  open,
  onOpenChange,
  targetFolderId,
  cycleName,
  athleteName,
  onCreateNew,
}: AddSessionSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  const { data: allSessions = [], isLoading } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
    enabled: open,
  });

  const duplicateMutation = useMutation({
    mutationFn: (sessionId: number) =>
      api.duplicateStrengthSession(sessionId, targetFolderId),
    onMutate: (sessionId) => setDuplicatingId(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      toast({ title: "S\u00e9ance ajout\u00e9e" });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Erreur lors de la copie";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    },
    onSettled: () => setDuplicatingId(null),
  });

  const filtered = search.trim()
    ? allSessions.filter((s) =>
        (s.title ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : allSessions;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] flex flex-col rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Ajouter une s&eacute;ance</SheetTitle>
          <SheetDescription className="text-xs">
            {cycleName} &mdash; {athleteName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-4">
          {/* Search */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Rechercher une s\u00e9ance..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Session list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Dumbbell className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {search.trim() ? "Aucune s\u00e9ance trouv\u00e9e" : "Aucune s\u00e9ance dans la biblioth\u00e8que"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((session) => (
                <button
                  key={session.id}
                  onClick={() => duplicateMutation.mutate(session.id)}
                  disabled={duplicatingId !== null}
                  className="flex items-center gap-3 w-full text-left rounded-lg border border-border px-3 py-3 hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {session.title || "Sans titre"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.items?.length ?? 0} exercice
                      {(session.items?.length ?? 0) !== 1 ? "s" : ""}
                      {session.cycle && (
                        <>
                          {" "}
                          &middot;{" "}
                          <span className="capitalize">{session.cycle}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {duplicatingId === session.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                  ) : (
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Separator + Create new */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                onCreateNew();
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Cr&eacute;er une s&eacute;ance vide
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
