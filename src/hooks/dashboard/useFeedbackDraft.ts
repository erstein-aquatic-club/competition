import { useEffect, useMemo, useState } from "react";
import type { Assignment, Session } from "@/lib/api";
import {
  assignmentPlannedStrokes,
  emptyStrokeDraft,
  kmToMeters,
  type DraftState,
  type PlannedSession,
  type StrokeDraft,
} from "./internal";

interface Params {
  activeSessionId: string | null;
  sessionsForSelectedDay: PlannedSession[];
  assignments: Assignment[] | undefined;
  getLogForSession: (sessionId: string) => Session | undefined;
}

/**
 * Owns the feedback draft state for the currently active session.
 * Isolated from the rest of the dashboard so that keystrokes on draft
 * fields no longer re-render the calendar grid.
 */
export function useFeedbackDraft({
  activeSessionId,
  sessionsForSelectedDay,
  assignments,
  getLogForSession,
}: Params) {
  const activeLog = useMemo(() => {
    if (!activeSessionId) return null;
    return getLogForSession(activeSessionId) || null;
  }, [activeSessionId, getLogForSession]);

  const feedbackDraft = useMemo<DraftState>(() => {
    const base: Partial<Session> = activeLog || {};
    const sd = base?.stroke_distances;
    const strokes: StrokeDraft = sd
      ? {
          NL: sd.NL ? String(sd.NL) : "",
          DOS: sd.DOS ? String(sd.DOS) : "",
          BR: sd.BR ? String(sd.BR) : "",
          PAP: sd.PAP ? String(sd.PAP) : "",
          QN: sd.QN ? String(sd.QN) : "",
        }
      : emptyStrokeDraft;
    return {
      difficulty: base?.effort ?? null,
      fatigue_end: base?.fatigue ?? base?.feeling ?? null,
      performance: base?.performance ?? base?.feeling ?? null,
      engagement: base?.engagement ?? base?.feeling ?? null,
      comment: String(base?.comments ?? ""),
      distanceMeters: Number.isFinite(Number(base?.distance)) ? Number(base.distance) : null,
      showStrokeDetail: !!(sd && Object.values(sd).some((v) => v && v > 0)),
      strokes,
      exerciseLogs: [],
    };
  }, [activeLog]);

  const [draftState, setDraftState] = useState<DraftState>(() => ({
    difficulty: null,
    fatigue_end: null,
    performance: null,
    engagement: null,
    comment: "",
    distanceMeters: null,
    showStrokeDetail: false,
    strokes: emptyStrokeDraft,
    exerciseLogs: [],
  }));

  useEffect(() => {
    const activeSession = sessionsForSelectedDay.find((s) => s.id === activeSessionId);
    if (activeSession) {
      const plannedMeters = activeSession.km != null ? kmToMeters(activeSession.km) : 5000;

      let plannedStrokes: StrokeDraft = emptyStrokeDraft;
      if (activeSession.assignmentId) {
        const assignment = (assignments ?? []).find((a) => a.id === activeSession.assignmentId);
        if (assignment?.items) {
          const strokeDistances = assignmentPlannedStrokes(assignment.items);
          if (strokeDistances) {
            plannedStrokes = {
              NL: String(strokeDistances.NL || ""),
              DOS: String(strokeDistances.DOS || ""),
              BR: String(strokeDistances.BR || ""),
              PAP: String(strokeDistances.PAP || ""),
              QN: String(strokeDistances.QN || ""),
            };
          }
        }
      }

      const hasExistingStrokes = Object.values(feedbackDraft.strokes).some((v) => v && Number(v) > 0);

      setDraftState((prev) => ({
        ...prev,
        ...feedbackDraft,
        distanceMeters: feedbackDraft.distanceMeters == null ? plannedMeters : feedbackDraft.distanceMeters,
        strokes: hasExistingStrokes ? feedbackDraft.strokes : plannedStrokes,
        showStrokeDetail: hasExistingStrokes || Object.values(plannedStrokes).some((v) => v && Number(v) > 0),
      }));
      return;
    }
    setDraftState((prev) => ({ ...prev, ...feedbackDraft }));
  }, [feedbackDraft, activeSessionId, sessionsForSelectedDay, assignments]);

  return { draftState, setDraftState };
}
