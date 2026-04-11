import { useState } from "react";
import type { ChronoRecord, ChronoRecordSwimmer } from "../../lib/api/types";
import { formatTime, formatLap } from "../../hooks/useChronoTimer";
import { WAVE_COLORS } from "../../lib/chrono-types";
import { Button } from "../../components/ui/button";
import { X, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ChronoSplitEditorProps {
  record: ChronoRecord;
  onUpdate: (swimmers: ChronoRecordSwimmer[]) => Promise<void>;
  onSend: (swimmerIdx?: number) => Promise<void>;
  onDelete: () => Promise<void>;
  readOnly?: boolean;
}

export default function ChronoSplitEditor({
  record,
  onUpdate,
  onSend,
  onDelete,
  readOnly,
}: ChronoSplitEditorProps) {
  const [selectedSwimmer, setSelectedSwimmer] = useState(0);
  const [selectedSeries, setSelectedSeries] = useState(0);
  const [localSwimmers, setLocalSwimmers] = useState<ChronoRecordSwimmer[]>(record.swimmers);
  const [saving, setSaving] = useState(false);

  const currentSwimmer = localSwimmers[selectedSwimmer];
  if (!currentSwimmer) return null;

  const currentSplits = currentSwimmer.splitsByRep[selectedSeries] ?? [];

  /* ---- handlers ---- */

  const handleDistanceChange = (splitIdx: number, newDistance: number) => {
    const updated = [...localSwimmers];
    const sw = { ...updated[selectedSwimmer] };
    const reps = [...sw.splitsByRep];
    const splits = [...reps[selectedSeries]];
    splits[splitIdx] = { ...splits[splitIdx], distanceM: newDistance };
    reps[selectedSeries] = splits;
    sw.splitsByRep = reps;
    updated[selectedSwimmer] = sw;
    setLocalSwimmers(updated);
  };

  const handleDeleteSplit = (splitIdx: number) => {
    const updated = [...localSwimmers];
    const sw = { ...updated[selectedSwimmer] };
    const reps = [...sw.splitsByRep];
    const splits = [...reps[selectedSeries]];
    splits.splice(splitIdx, 1);
    // Recalculate lap times after deletion
    for (let i = 0; i < splits.length; i++) {
      splits[i] = {
        ...splits[i],
        lapMs: i === 0 ? splits[i].cumulativeMs : splits[i].cumulativeMs - splits[i - 1].cumulativeMs,
      };
    }
    reps[selectedSeries] = splits;
    sw.splitsByRep = reps;
    updated[selectedSwimmer] = sw;
    setLocalSwimmers(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(localSwimmers);
      toast.success("Modifications enregistrées");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
    setSaving(false);
  };

  /* ---- render ---- */

  return (
    <div className="space-y-2">
      {/* Swimmer tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {localSwimmers.map((sw, idx) => {
          const wc = WAVE_COLORS[(sw.wave - 1) % WAVE_COLORS.length];
          return (
            <button
              key={sw.athleteId}
              onClick={() => { setSelectedSwimmer(idx); setSelectedSeries(0); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                idx === selectedSwimmer
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {sw.displayName}
              <span className={`inline-block h-2 w-2 rounded-full ${wc.dot}`} />
            </button>
          );
        })}
      </div>

      {/* Series tabs (only if multiple series) */}
      {currentSwimmer.splitsByRep.length > 1 && (
        <div className="flex gap-1 mt-2">
          {currentSwimmer.splitsByRep.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedSeries(idx)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                idx === selectedSeries
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              S{idx + 1}
            </button>
          ))}
        </div>
      )}

      {/* Split table */}
      <div className="mt-3 rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[80px_1fr_1fr_40px] gap-px bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
          <span>Distance</span>
          <span>Cumul</span>
          <span>Partiel</span>
          <span></span>
        </div>
        {/* Rows */}
        {currentSplits.map((split, i) => (
          <div key={i} className="grid grid-cols-[80px_1fr_1fr_40px] gap-px items-center border-t px-3 py-2">
            <div>
              {readOnly ? (
                <span className="text-sm text-muted-foreground">{split.distanceM}m</span>
              ) : (
                <div className="flex items-center gap-0.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={split.distanceM || ""}
                    onChange={(e) => handleDistanceChange(i, Number(e.target.value.replace(/\D/g, "")) || 0)}
                    className="w-12 text-sm font-mono text-center bg-transparent border-b border-border outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              )}
            </div>
            <span className="font-mono tabular-nums text-sm text-foreground">
              {formatTime(split.cumulativeMs)}
            </span>
            <span className="font-mono tabular-nums text-sm text-muted-foreground">
              {formatLap(split.lapMs)}
            </span>
            <div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleDeleteSplit(i)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mt-4">
        {!readOnly && (
          <>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              Enregistrer les modifications
            </Button>
            <Button size="sm" onClick={() => onSend(selectedSwimmer)} disabled={saving}>
              <Send className="mr-1.5 h-4 w-4" />
              Envoyer {currentSwimmer.displayName}
            </Button>
            <Button size="sm" onClick={() => onSend()} disabled={saving}>
              <Send className="mr-1.5 h-4 w-4" />
              Envoyer tous
            </Button>
          </>
        )}
        {!readOnly && (
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
}
