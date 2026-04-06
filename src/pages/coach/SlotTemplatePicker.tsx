import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSwimCatalog } from "@/lib/api/swim";
import type { SwimSessionTemplate } from "@/lib/api/types";
import { calculateSwimTotalDistance } from "@/lib/swimSessionUtils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Search, SwatchBook, Waves } from "lucide-react";

/* ─── Helpers ────────────────────────────────────────────── */

function formatRelativeDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} sem.`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function isRecent(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const diffMs = Date.now() - new Date(iso).getTime();
  return diffMs < 7 * 24 * 60 * 60 * 1000;
}

/* ─── Props ───────────────────────────────────────────────── */

interface SlotTemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (catalogId: number, sessionName: string) => void;
  isAssigning?: boolean;
}

/* ─── Component ───────────────────────────────────────────── */

export function SlotTemplatePicker({
  open,
  onOpenChange,
  onSelect,
  isAssigning = false,
}: SlotTemplatePickerProps) {
  const [search, setSearch] = useState("");

  /* ── data ─────────────────────────────────────────────── */

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["swim_catalog"],
    queryFn: () => getSwimCatalog(),
    enabled: open,
  });

  /* Filter out archived, apply search, keep newest-first order from API */
  const filtered = useMemo(() => {
    if (!sessions) return [];
    const q = search.trim().toLowerCase();
    return sessions
      .filter((s) => !s.is_archived)
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.folder ?? "").toLowerCase().includes(q),
      );
  }, [sessions, search]);

  /* ── handlers ────────────────────────────────────────── */

  const handleSelect = (session: SwimSessionTemplate) => {
    if (isAssigning) return;
    onSelect(session.id, session.name);
  };

  /* ── render ──────────────────────────────────────────── */

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex flex-col overflow-hidden rounded-t-2xl px-4 pb-4 pt-5"
        style={{ maxHeight: "80dvh" }}
      >
        {/* Header */}
        <SheetHeader className="shrink-0 space-y-1">
          <SheetTitle className="text-base font-semibold">
            Choisir une séance
          </SheetTitle>
          <SheetDescription className="sr-only">
            Parcourez et recherchez dans la bibliothèque de séances natation
          </SheetDescription>
        </SheetHeader>

        {/* Search */}
        <div className="relative mt-3 shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher une séance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Scrollable list */}
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Waves className="h-10 w-10 opacity-40" />
              <p className="text-sm">Aucune séance dans la bibliothèque</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((session) => {
                const totalDistance = calculateSwimTotalDistance(
                  session.items ?? [],
                );
                const relDate = formatRelativeDate(session.created_at);
                const recent = isRecent(session.created_at);
                return (
                  <button
                    key={session.id}
                    type="button"
                    disabled={isAssigning}
                    onClick={() => handleSelect(session)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
                      recent
                        ? "border-blue-500/30 bg-blue-500/5"
                        : "border-border bg-card"
                    }`}
                  >
                    {/* Icon */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      recent ? "bg-blue-500/15 text-blue-500" : "bg-blue-500/10 text-blue-400"
                    }`}>
                      <SwatchBook className="h-5 w-5" />
                    </div>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {session.name}
                        </p>
                        {recent && (
                          <span className="shrink-0 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                            Récent
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {totalDistance > 0 && (
                          <span>{totalDistance.toLocaleString("fr-FR")} m</span>
                        )}
                        {totalDistance > 0 && session.folder && (
                          <span aria-hidden="true">·</span>
                        )}
                        {session.folder && (
                          <span className="truncate">{session.folder}</span>
                        )}
                        {(totalDistance > 0 || session.folder) && relDate && (
                          <span aria-hidden="true">·</span>
                        )}
                        {relDate && (
                          <span className="inline-flex items-center gap-0.5 shrink-0">
                            <Clock className="h-2.5 w-2.5 opacity-60" />
                            {relDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
