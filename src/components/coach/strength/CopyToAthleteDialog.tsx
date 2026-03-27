import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { AthleteSummary } from "@/lib/api/types";

interface CopyToAthleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athletes: AthleteSummary[];
  mode: "session" | "folder" | "plan";
  sourceLabel: string;
  onConfirm: (targetAthleteId: number) => void;
  loading?: boolean;
}

export function CopyToAthleteDialog({
  open,
  onOpenChange,
  athletes,
  mode,
  sourceLabel,
  onConfirm,
  loading,
}: CopyToAthleteDialogProps) {
  const [targetAthleteId, setTargetAthleteId] = useState<number | null>(null);

  useEffect(() => {
    if (open) setTargetAthleteId(null);
  }, [open]);

  const title =
    mode === "plan"
      ? "Copier le plan complet"
      : mode === "folder"
        ? "Copier le cycle"
        : "Copier la séance";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Copier <strong>{sourceLabel}</strong> vers un autre nageur
        </p>
        <Select onValueChange={(v) => setTargetAthleteId(Number(v))}>
          <SelectTrigger>
            <SelectValue placeholder="Choisir un nageur" />
          </SelectTrigger>
          <SelectContent>
            {athletes
              .filter((a) => a.id != null)
              .map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.display_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          className="mt-4 w-full"
          disabled={targetAthleteId === null || loading}
          onClick={() => {
            if (targetAthleteId !== null) {
              onConfirm(targetAthleteId);
            }
          }}
        >
          {loading ? "Copie en cours..." : "Copier"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
