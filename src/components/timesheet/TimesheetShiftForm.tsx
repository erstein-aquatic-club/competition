import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimesheetTimeWheel } from "@/components/timesheet/TimesheetTimeWheel";

const pad2 = (value: number) => String(value).padStart(2, "0");

const buildRoundedTime = () => {
  const now = new Date();
  const minutes = Math.round(now.getMinutes() / 5) * 5;
  const overflow = minutes === 60 ? 1 : 0;
  const hours = (now.getHours() + overflow) % 24;
  const safeMinutes = minutes === 60 ? 0 : minutes;
  return `${pad2(hours)}:${pad2(safeMinutes)}`;
};

const addMinutes = (value: string, minutesToAdd: number) => {
  const [rawHours, rawMinutes] = value.split(":").map((part) => Number(part));
  const hours = Number.isFinite(rawHours) ? rawHours : 0;
  const minutes = Number.isFinite(rawMinutes) ? rawMinutes : 0;
  const totalMinutes = (hours * 60 + minutes + minutesToAdd + 24 * 60) % (24 * 60);
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${pad2(nextHours)}:${pad2(nextMinutes)}`;
};

interface TimesheetShiftFormProps {
  isOpen: boolean;
  isEditing: boolean;
  isSaving: boolean;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  isTravel: boolean;
  durationLabel: string | null;
  locations: { id: number; name: string }[];
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onDateChange: (value: string) => void;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onTravelChange: (value: boolean) => void;
  onCreateLocation: (name: string) => void;
  onDeleteLocation: (id: number) => void;
  permanentGroups: { id: number; name: string }[];
  customGroupLabels: { id: number; name: string }[];
  selectedGroupNames: string[];
  onGroupToggle: (name: string) => void;
  onCreateGroupLabel: (name: string) => void;
  onDeleteGroupLabel: (id: number) => void;
}

export function TimesheetShiftForm({
  isOpen,
  isEditing,
  isSaving,
  date,
  startTime,
  endTime,
  location,
  isTravel,
  durationLabel,
  locations,
  onClose,
  onSubmit,
  onDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onLocationChange,
  onTravelChange,
  onCreateLocation,
  onDeleteLocation,
  permanentGroups,
  customGroupLabels,
  selectedGroupNames,
  onGroupToggle,
  onCreateGroupLabel,
  onDeleteGroupLabel,
}: TimesheetShiftFormProps) {
  const snapKey = React.useMemo(() => (isOpen ? Date.now() : 0), [isOpen]);
  const [isLocationPanelOpen, setIsLocationPanelOpen] = React.useState(false);
  const [newLocationName, setNewLocationName] = React.useState("");

  React.useEffect(() => {
    if (!isOpen || isEditing || startTime) return;
    const rounded = buildRoundedTime();
    onStartTimeChange(rounded);
    if (!endTime) {
      onEndTimeChange(addMinutes(rounded, 60));
    }
  }, [endTime, isEditing, isOpen, onEndTimeChange, onStartTimeChange, startTime]);

  const handleAddLocation = () => {
    const trimmed = newLocationName.trim();
    if (!trimmed) return;
    onCreateLocation(trimmed);
    setNewLocationName("");
  };

  const [newGroupLabelName, setNewGroupLabelName] = React.useState("");

  const handleAddGroupLabel = () => {
    const trimmed = newGroupLabelName.trim();
    if (!trimmed) return;
    onCreateGroupLabel(trimmed);
    setNewGroupLabelName("");
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Modifier shift" : "Nouveau shift"}
      className="fixed inset-0 z-modal flex items-end justify-center bg-black/35 px-3 pb-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-card shadow-[0_12px_40px_rgba(0,0,0,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" />
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 pb-2 pt-3 text-sm font-black">
          <div>{isEditing ? "Modifier shift" : "Nouveau shift"}</div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Fermer
          </Button>
          <div className="col-span-2 text-center text-sm font-black text-card-foreground">
            {startTime || "—"} → {endTime || "En cours"}
            {durationLabel ? ` • Durée ${durationLabel}` : null}
          </div>
        </div>

        <form onSubmit={onSubmit} className="max-h-[72dvh] space-y-4 overflow-y-auto px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="shift-date">Date</Label>
            <Input id="shift-date" type="date" value={date} onChange={(event) => onDateChange(event.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-3">
              <TimesheetTimeWheel
                label="Heure d’arrivée"
                value={startTime}
                onChange={onStartTimeChange}
                snapKey={snapKey}
              />
              <button
                type="button"
                aria-label="Heure d'arrivée maintenant"
                className="mx-auto block h-8 min-w-[110px] rounded-full border border-border bg-card px-3 text-xs font-bold text-card-foreground"
                onClick={() => {
                  const nowValue = buildRoundedTime();
                  onStartTimeChange(nowValue);
                }}
              >
                Maintenant
              </button>
            </div>
            <div className="space-y-3">
              <TimesheetTimeWheel
                label="Heure de sortie"
                value={endTime}
                onChange={onEndTimeChange}
                allowEmpty
                showEmptyButton={false}
                snapKey={snapKey}
              />
              <button
                type="button"
                aria-label="Heure de sortie maintenant"
                className="mx-auto block h-8 min-w-[110px] rounded-full border border-border bg-card px-3 text-xs font-bold text-card-foreground"
                onClick={() => {
                  const nowValue = buildRoundedTime();
                  onEndTimeChange(nowValue);
                }}
              >
                Maintenant
              </button>
              <button
                type="button"
                aria-label="Marquer comme en cours"
                className="mx-auto block h-8 min-w-[110px] rounded-full border border-border bg-card px-3 text-xs font-bold text-card-foreground"
                onClick={() => onEndTimeChange("")}
              >
                En cours
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shift-location">Lieu</Label>
            <Select value={location || undefined} onValueChange={onLocationChange}>
              <SelectTrigger id="shift-location">
                <SelectValue placeholder="Sélectionner un lieu" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((item) => (
                  <SelectItem key={item.id} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Groupes encadrés */}
          <div className="space-y-2">
            <Label>Groupes encadrés</Label>
            <div className="flex flex-wrap gap-2">
              {permanentGroups.map((g) => (
                <label
                  key={`perm-${g.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold cursor-pointer select-none"
                >
                  <Checkbox
                    checked={selectedGroupNames.includes(g.name)}
                    onCheckedChange={() => onGroupToggle(g.name)}
                  />
                  <span>{g.name}</span>
                </label>
              ))}
              {customGroupLabels.map((g) => (
                <label
                  key={`custom-${g.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-semibold cursor-pointer select-none"
                >
                  <Checkbox
                    checked={selectedGroupNames.includes(g.name)}
                    onCheckedChange={() => onGroupToggle(g.name)}
                  />
                  <span>{g.name}</span>
                  <button
                    type="button"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.preventDefault(); onDeleteGroupLabel(g.id); }}
                    aria-label={`Supprimer ${g.name}`}
                  >
                    ✕
                  </button>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newGroupLabelName}
                onChange={(e) => setNewGroupLabelName(e.target.value)}
                placeholder="Ajouter un groupe..."
                className="h-8 flex-1 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleAddGroupLabel(); }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleAddGroupLabel}
                disabled={!newGroupLabelName.trim()}
              >
                +
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="shift-travel" checked={isTravel} onCheckedChange={(checked) => onTravelChange(checked === true)} />
            <Label htmlFor="shift-travel">Temps de trajet</Label>
          </div>

          <div className="flex gap-3 border-t border-border pt-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" className="flex-1" disabled={isSaving}>
              {isEditing ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
