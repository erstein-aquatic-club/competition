import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarHeader } from "@/components/dashboard/CalendarHeader";
import { CalendarGrid } from "@/components/dashboard/CalendarGrid";
import { useCoachCalendarState } from "@/hooks/useCoachCalendarState";
import type { DaySlot } from "@/hooks/useCoachCalendarState";
import CoachSectionHeader from "./CoachSectionHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AlertCircle, Dumbbell, Waves, Trash2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { InlineBanner } from "@/components/shared/InlineBanner";

type FilterMode = "group" | "user";

interface CoachCalendarProps {
  onBack?: () => void;
  athletes: Array<{ id: number | null; display_name: string; group_label?: string | null }>;
  groups: Array<{ id: number | string; name: string }>;
  swimSessions?: Array<{ id: number; name: string }>;
  strengthSessions?: Array<{ id: number; title: string }>;
}

function formatDateFR(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function CoachCalendar({ onBack, athletes, groups, swimSessions, strengthSessions }: CoachCalendarProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("group");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const groupId = filterMode === "group" && selectedGroupId ? Number(selectedGroupId) : null;
  const userId = filterMode === "user" && selectedUserId ? Number(selectedUserId) : null;

  const {
    today,
    monthCursor,
    selectedISO,
    selectedDayIndex,
    drawerOpen,
    gridDates,
    completionByISO,
    selectedDayStatus,
    slotsForSelectedDay,
    hasStrengthByISO,
    absenceDates,
    hasFilter,
    setSelectedISO,
    setSelectedDayIndex,
    setDrawerOpen,
    prevMonth,
    nextMonth,
    jumpToday,
    openDay,
  } = useCoachCalendarState({ groupId, userId, enabled: true });

  const queryClient = useQueryClient();

  const assignMutation = useMutation({
    mutationFn: (params: {
      assignment_type: "swim" | "strength";
      session_id: number;
      scheduled_date: string;
      scheduled_slot?: "morning" | "evening";
      target_group_id?: number | null;
      target_user_id?: number | null;
    }) => api.assignments_create(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-calendar-assignments"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (assignmentId: number) => api.assignments_delete(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-calendar-assignments"] });
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
    if (e.key === "ArrowRight") nextIndex = Math.min(gridDates.length - 1, index + 1);
    if (e.key === "ArrowUp") nextIndex = Math.max(0, index - 7);
    if (e.key === "ArrowDown") nextIndex = Math.min(gridDates.length - 1, index + 7);
    if (nextIndex !== index) {
      e.preventDefault();
      setSelectedDayIndex(nextIndex);
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const d = gridDates[nextIndex];
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      setSelectedISO(iso);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const d = gridDates[index];
      const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      openDay(iso);
    }
  };

  return (
    <div className="space-y-4">
      <CoachSectionHeader
        title="Calendrier"
        description="Vue mensuelle des assignations"
        onBack={onBack}
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ToggleGroup
          type="single"
          value={filterMode}
          onValueChange={(v) => {
            if (v === "group" || v === "user") setFilterMode(v);
          }}
          className="shrink-0"
        >
          <ToggleGroupItem value="group" className="text-xs px-3">Groupe</ToggleGroupItem>
          <ToggleGroupItem value="user" className="text-xs px-3">Nageur</ToggleGroupItem>
        </ToggleGroup>

        {filterMode === "group" ? (
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Choisir un groupe" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={String(g.id)} value={String(g.id)}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Choisir un nageur" />
            </SelectTrigger>
            <SelectContent>
              {athletes
                .filter((a) => a.id != null)
                .map((a) => (
                  <SelectItem key={String(a.id)} value={String(a.id)}>
                    {a.display_name}
                    {a.group_label ? ` · ${a.group_label}` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Calendar */}
      {!hasFilter ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Sélectionnez un groupe ou un nageur pour afficher le calendrier.
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-sm">
          <CalendarHeader
            monthCursor={monthCursor}
            selectedDayStatus={selectedDayStatus}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            onJumpToday={jumpToday}
          />
          <CalendarGrid
            monthCursor={monthCursor}
            gridDates={gridDates}
            completionByISO={completionByISO}
            strengthByISO={hasStrengthByISO}
            absenceDates={absenceDates}
            selectedISO={selectedISO}
            selectedDayIndex={selectedDayIndex}
            today={today}
            onDayClick={openDay}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {/* Day detail drawer (Sheet) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="pb-3">
            <SheetTitle className="capitalize text-left">
              {formatDateFR(selectedISO)}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Gérer les assignations pour cette journée
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3">
            <InlineBanner
              variant="red"
              icon={<AlertCircle />}
              label="Absence prévue"
              visible={absenceDates.has(selectedISO)}
              animate={false}
            />
            {slotsForSelectedDay.map((slot) => {
              const isGroupAssignment = slot.assignment?.targetType === "group";
              const isUserMode = filterMode === "user";
              return (
                <SlotRow
                  key={slot.key}
                  slot={slot}
                  swimSessions={swimSessions}
                  strengthSessions={strengthSessions}
                  isGroupAssignment={isGroupAssignment && isUserMode}
                  onAssign={(sessionId) => {
                    assignMutation.mutate({
                      assignment_type: slot.type,
                      session_id: sessionId,
                      scheduled_date: selectedISO,
                      scheduled_slot: slot.scheduledSlot ?? undefined,
                      target_group_id: groupId,
                      target_user_id: userId,
                    });
                  }}
                  onDelete={(assignmentId) => {
                    deleteMutation.mutate(assignmentId);
                  }}
                  onReplace={(oldAssignmentId, newSessionId) => {
                    if (isGroupAssignment && isUserMode) {
                      // Create user-level override without deleting the group assignment
                      assignMutation.mutate({
                        assignment_type: slot.type,
                        session_id: newSessionId,
                        scheduled_date: selectedISO,
                        scheduled_slot: slot.scheduledSlot ?? undefined,
                        target_user_id: userId,
                      });
                    } else {
                      deleteMutation.mutate(oldAssignmentId, {
                        onSuccess: () => {
                          assignMutation.mutate({
                            assignment_type: slot.type,
                            session_id: newSessionId,
                            scheduled_date: selectedISO,
                            scheduled_slot: slot.scheduledSlot ?? undefined,
                            target_group_id: groupId,
                            target_user_id: userId,
                          });
                        },
                      });
                    }
                  }}
                  isPending={assignMutation.isPending || deleteMutation.isPending}
                />
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SlotRow({
  slot,
  swimSessions,
  strengthSessions,
  isGroupAssignment,
  onAssign,
  onDelete,
  onReplace,
  isPending,
}: {
  slot: DaySlot;
  swimSessions?: Array<{ id: number; name: string }>;
  strengthSessions?: Array<{ id: number; title: string }>;
  isGroupAssignment?: boolean;
  onAssign: (sessionId: number) => void;
  onDelete: (assignmentId: number) => void;
  onReplace: (oldAssignmentId: number, newSessionId: number) => void;
  isPending: boolean;
}) {
  const [isChanging, setIsChanging] = useState(false);
  const isSwim = slot.type === "swim";
  const catalog = isSwim
    ? (swimSessions ?? []).map((s) => ({ id: s.id, label: s.name }))
    : (strengthSessions ?? []).map((s) => ({ id: s.id, label: s.title }));
  const hasAssignment = slot.assignment !== null;

  const handleSelect = (value: string) => {
    const sessionId = Number(value);
    if (!sessionId) return;

    if (hasAssignment && isChanging) {
      onReplace(slot.assignment!.id, sessionId);
      setIsChanging(false);
    } else {
      onAssign(sessionId);
    }
  };

  return (
    <div className="rounded-xl border p-3 space-y-2">
      <div className="flex items-center gap-2">
        {isSwim ? (
          <Waves className="h-4 w-4 text-blue-500 shrink-0" />
        ) : (
          <Dumbbell className="h-4 w-4 text-orange-500 shrink-0" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {slot.label}
        </span>
      </div>

      {hasAssignment && !isChanging ? (
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate flex-1">
            {slot.assignment!.title}
            {isGroupAssignment && (
              <span className="ml-1.5 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full align-middle">
                Groupe
              </span>
            )}
          </p>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-10 w-10 shrink-0"
            disabled={isPending}
            onClick={() => setIsChanging(true)}
            title={isGroupAssignment ? "Personnaliser" : "Changer"}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {!isGroupAssignment && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 shrink-0 text-destructive hover:text-destructive"
              disabled={isPending}
              onClick={() => onDelete(slot.assignment!.id)}
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ) : (
        <Select
          value=""
          onValueChange={handleSelect}
          disabled={isPending || catalog.length === 0}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder={isChanging ? (isGroupAssignment ? "Personnaliser pour ce nageur" : "Choisir le remplacement") : "Choisir une séance"} />
          </SelectTrigger>
          <SelectContent>
            {catalog.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isChanging ? (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setIsChanging(false)}
        >
          Annuler
        </button>
      ) : null}
    </div>
  );
}
