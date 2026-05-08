import * as React from "react";
import { Redirect } from "wouter";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  summarizeApiError,
  listTimesheetCoaches,
  listTimesheetShifts,
  getCapabilities,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabaseConfig } from "@/lib/config";
import {
  calculateTimesheetTotals,
  formatMinutes,
  getShiftDurationMinutes,
  type TimesheetShift,
} from "@/pages/timesheetHelpers";
import { PendingApprovals } from "@/components/shared/PendingApprovals";

const formatTime = (value?: string | null) => {
  if (!value) return "—";
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value.slice(0, 5);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "HH:mm");
};

export default function Comite() {
  const { useMemo, useState } = React;
  const role = typeof window === "undefined" ? useAuth.getState().role : useAuth((state) => state.role);
  const isComite = role === "comite" || role === "admin";

  const [selectedCoach, setSelectedCoach] = useState<string>("all");
  const [showTravelOnly, setShowTravelOnly] = useState(false);

  const { data: coaches = [] } = useQuery({
    queryKey: ["timesheet-coaches"],
    queryFn: () => listTimesheetCoaches(),
    enabled: isComite,
  });

  const coachId = selectedCoach === "all" ? undefined : Number(selectedCoach);

  const { data: shifts = [], error: shiftsError } = useQuery({
    queryKey: ["timesheet-shifts", coachId ?? "all"],
    queryFn: () => listTimesheetShifts({ coachId }),
    enabled: isComite,
  });

  const { data: capabilities, error: capabilitiesError } = useQuery({
    queryKey: ["capabilities", "timesheet"],
    queryFn: () => getCapabilities(),
    enabled: supabaseConfig.hasSupabase,
  });

  const totals = calculateTimesheetTotals(shifts);
  const visibleShifts = useMemo(
    () => (showTravelOnly ? shifts.filter((shift) => shift.is_travel) : shifts),
    [shifts, showTravelOnly],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, TimesheetShift[]>();
    visibleShifts.forEach((shift) => {
      const key = shift.shift_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(shift);
    });
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [visibleShifts]);

  if (!isComite) {
    if (typeof window === "undefined") {
      return null;
    }
    return <Redirect to="/" />;
  }

  const capabilityMessage = capabilitiesError
    ? summarizeApiError(capabilitiesError, "Impossible de vérifier le module de pointage.").message
    : capabilities?.mode === "supabase" && !capabilities.timesheet.available
      ? "Pointage heures indisponible (tables manquantes côté D1)."
      : null;
  const shiftsErrorMessage = shiftsError
    ? summarizeApiError(shiftsError, "Impossible de charger les shifts.").message
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Comité</h1>
        <div className="text-sm text-muted-foreground">Tableau de bord shifts</div>
      </div>

      <PendingApprovals />

      {capabilityMessage ? (
        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground">{capabilityMessage}</CardContent>
        </Card>
      ) : null}
      {shiftsErrorMessage ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">{shiftsErrorMessage}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filtrer par coach</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedCoach} onValueChange={setSelectedCoach}>
            <SelectTrigger className="w-full md:w-80">
              <SelectValue placeholder="Tous les coachs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les coachs</SelectItem>
              {coaches.map((coach) => (
                <SelectItem key={coach.id} value={String(coach.id)}>
                  {coach.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Totals semaine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <div>Travail: {formatMinutes(totals.week.workMinutes)}</div>
            <div>Trajet: {formatMinutes(totals.week.travelMinutes)}</div>
            <div className="font-semibold text-foreground">Total: {formatMinutes(totals.week.totalMinutes)}</div>
            <div className="text-xs text-muted-foreground">Les shifts en cours ne sont pas comptabilisés.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Totals mois</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <div>Travail: {formatMinutes(totals.month.workMinutes)}</div>
            <div>Trajet: {formatMinutes(totals.month.travelMinutes)}</div>
            <div className="font-semibold text-foreground">Total: {formatMinutes(totals.month.totalMinutes)}</div>
            <div className="text-xs text-muted-foreground">Les shifts en cours ne sont pas comptabilisés.</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Shifts enregistrés</CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                id="shift-travel-filter"
                checked={showTravelOnly}
                onCheckedChange={(checked) => setShowTravelOnly(checked === true)}
              />
              <Label htmlFor="shift-travel-filter">Trajet uniquement</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {showTravelOnly ? "Aucun trajet disponible." : "Aucun shift disponible."}
            </p>
          ) : (
            grouped.map(([day, items]) => (
              <div key={day} className="space-y-2">
                <div className="text-sm font-semibold text-foreground">{day}</div>
                <div className="space-y-2">
                  {items.map((shift) => {
                    const duration = getShiftDurationMinutes(shift);
                    return (
                      <div
                        key={shift.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                      >
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">
                            {formatTime(shift.start_time)} →{" "}
                            {shift.end_time ? formatTime(shift.end_time) : "En cours · non comptabilisé"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {shift.coach_name || "Coach"} · {shift.location || "Lieu non précisé"} ·{" "}
                            {shift.is_travel ? "Trajet" : "Travail"}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {duration !== null ? formatMinutes(duration) : "En cours"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
