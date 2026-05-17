/**
 * KpiSwimmerPicker — bottom-sheet swimmer picker used by the KPI wizard.
 *
 * Two roles:
 *  - athlete-selection step (coach picks who is being measured)
 *  - "accompagné par" partner field (who assists the measurement)
 *
 * Searchable, mobile-first. Reuses the shared design language (Drawer +
 * Avatar + Input) — no new visual identity.
 */
import { useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Check, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "./kpiHelpers";
import type { AthleteSummary } from "@/lib/api/types";

export function KpiSwimmerPicker({
  open,
  onOpenChange,
  swimmers,
  selectedId,
  onSelect,
  title,
  description,
  allowNone = false,
  noneLabel = "Personne",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swimmers: AthleteSummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  title: string;
  description?: string;
  /** When true, an explicit "none" row is shown (used for the optional partner). */
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const valid = swimmers.filter((s) => s.id != null);
    if (!q) return valid;
    return valid.filter((s) => s.display_name.toLowerCase().includes(q));
  }, [swimmers, query]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden px-4 pb-6">
          <DrawerHeader className="px-0 pb-3">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un nageur…"
              aria-label="Rechercher un nageur"
              className="h-11 pl-9"
            />
          </div>

          <div className="-mx-1 flex-1 space-y-1 overflow-y-auto overscroll-contain px-1 pb-2">
            {allowNone && (
              <button
                type="button"
                aria-pressed={selectedId == null}
                onClick={() => {
                  onSelect(null);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99]",
                  selectedId == null
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserX className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium">{noneLabel}</span>
                {selectedId == null && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            )}

            {filtered.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                Aucun nageur trouvé.
              </p>
            )}

            {filtered.map((s) => {
              const selected = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onSelect(s.id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99]",
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:bg-muted/50",
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {s.avatar_url && <AvatarImage src={s.avatar_url} alt={s.display_name} />}
                    <AvatarFallback className="bg-muted text-[11px] font-semibold">
                      {initials(s.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate text-sm font-medium">{s.display_name}</span>
                  {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
