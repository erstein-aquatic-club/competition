import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

type PoolSize = "25m" | "50m";

interface PdfExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  swimmerName: string;
  targets: Array<{ target_pool_size: PoolSize }>;
  onConfirm: (pool: PoolSize) => Promise<void>;
}

export function computeDefaultPdfPool(
  targets: Array<{ target_pool_size: PoolSize }>,
): PoolSize {
  if (targets.length === 0) return "50m";
  let count50 = 0;
  let count25 = 0;
  for (const t of targets) {
    if (t.target_pool_size === "50m") count50++;
    else count25++;
  }
  if (count25 > count50) return "25m";
  return "50m";
}

export function PdfExportDialog({
  open,
  onOpenChange,
  swimmerName,
  targets,
  onConfirm,
}: PdfExportDialogProps) {
  const [selectedPool, setSelectedPool] = useState<PoolSize>(() =>
    computeDefaultPdfPool(targets),
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedPool(computeDefaultPdfPool(targets));
      setSubmitting(false);
    }
  }, [open, targets]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(selectedPool);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exporter le PDF · {swimmerName}</DialogTitle>
          <DialogDescription>
            Quel bassin pour les valeurs affichées ?
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selectedPool}
          onValueChange={(v) => setSelectedPool(v as PoolSize)}
          className="space-y-2 py-2"
        >
          <div className="flex items-center space-x-3 rounded-md border border-border/40 p-3 hover:bg-muted/30">
            <RadioGroupItem value="50m" id="pdf-pool-50" />
            <Label htmlFor="pdf-pool-50" className="flex-1 cursor-pointer text-sm font-medium">
              Bassin 50m
            </Label>
          </div>
          <div className="flex items-center space-x-3 rounded-md border border-border/40 p-3 hover:bg-muted/30">
            <RadioGroupItem value="25m" id="pdf-pool-25" />
            <Label htmlFor="pdf-pool-25" className="flex-1 cursor-pointer text-sm font-medium">
              Bassin 25m
            </Label>
          </div>
        </RadioGroup>

        <p className="text-xs text-muted-foreground">
          Conversion FFN appliquée si différent du bassin d'origine de la cible.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Générer PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
