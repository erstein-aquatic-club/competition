import { useState, useEffect, useMemo } from "react";
import { StrengthSessionTemplate, StrengthCycleType, Assignment } from "@/lib/api";
import type { SetLogEntry } from "@/lib/types";
import { SaveState } from "@/components/shared/BottomActionBar";

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") {
    return value;
  }
  return "endurance";
};

interface UseStrengthStateProps {
  athleteKey: number | string | null;
}

export function useStrengthState({ athleteKey }: UseStrengthStateProps) {
  const preferenceStorageKey = "strength-preferences";
  const focusStorageKey = useMemo(
    () => `strength-focus-state-${athleteKey ?? "anonymous"}`,
    [athleteKey]
  );

  // Session state
  const [activeSession, setActiveSession] = useState<StrengthSessionTemplate | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeRunLogs, setActiveRunLogs] = useState<SetLogEntry[] | null>(null);
  const [activeRunnerStep, setActiveRunnerStep] = useState(0);
  const [screenMode, setScreenMode] = useState<"list" | "reader" | "focus" | "settings" | "summary">("list");
  const [isFinishing, setIsFinishing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // UI state
  const [preferences, setPreferences] = useState({
    poolMode: false,
    largeText: false,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [cycleType, setCycleType] = useState<StrengthCycleType>("endurance");

  // Load preferences from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(preferenceStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setPreferences((prev) => ({
        ...prev,
        ...(parsed ?? {}),
      }));
    } catch {
      return;
    }
  }, []);

  // Save preferences to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(preferenceStorageKey, JSON.stringify(preferences));
  }, [preferenceStorageKey, preferences]);

  // Focus mode body attribute
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (screenMode === "focus") {
      document.body.dataset.focusMode = "strength";
      return () => {
        if (document.body.dataset.focusMode === "strength") {
          delete document.body.dataset.focusMode;
        }
      };
    }
    if (document.body.dataset.focusMode === "strength") {
      delete document.body.dataset.focusMode;
    }
    return;
  }, [screenMode]);

  // Restore focus state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeSession) return;
    const stored = window.localStorage.getItem(focusStorageKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const parsedMode =
        parsed?.screenMode === "focus"
          ? "focus"
          : parsed?.screenMode === "reader"
          ? "reader"
          : null;
      if (!parsedMode || !parsed?.session) return;
      setActiveSession(parsed.session);
      setActiveAssignment(parsed.assignment ?? null);
      setActiveRunId(typeof parsed.runId === "number" ? parsed.runId : null);
      setActiveRunLogs(Array.isArray(parsed.runLogs) ? parsed.runLogs : null);
      setActiveRunnerStep(Number.isFinite(parsed.runnerStep) ? parsed.runnerStep : 0);
      if (parsed.cycleType) {
        setCycleType(normalizeStrengthCycle(parsed.cycleType));
      }
      setScreenMode(parsedMode);
    } catch {
      return;
    }
  }, [activeSession, focusStorageKey]);

  // Save focus state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldPersist = screenMode === "focus" || screenMode === "reader";
    if (!shouldPersist || !activeSession) {
      window.localStorage.removeItem(focusStorageKey);
      return;
    }
    const payload = {
      screenMode,
      session: activeSession,
      assignment: activeAssignment,
      runId: activeRunId,
      runLogs: activeRunLogs,
      runnerStep: activeRunnerStep,
      cycleType,
    };
    window.localStorage.setItem(focusStorageKey, JSON.stringify(payload));
  }, [
    activeAssignment,
    activeRunId,
    activeRunLogs,
    activeRunnerStep,
    activeSession,
    cycleType,
    focusStorageKey,
    screenMode,
  ]);

  // Reset view state when dock icon is tapped while already on this page
  useEffect(() => {
    const reset = () => {
      setScreenMode("list");
      setActiveSession(null);
      setActiveAssignment(null);
      setActiveRunId(null);
      setActiveRunLogs(null);
      setActiveRunnerStep(0);
      setSearchQuery("");
    };
    window.addEventListener("nav:reset", reset);
    return () => window.removeEventListener("nav:reset", reset);
  }, []);

  // Reset run state helper
  const clearActiveRunState = () => {
    setActiveSession(null);
    setActiveAssignment(null);
    setActiveRunId(null);
    setActiveRunLogs(null);
    setActiveRunnerStep(0);
    setScreenMode("list");
  };

  return {
    // Session state
    activeSession,
    setActiveSession,
    activeAssignment,
    setActiveAssignment,
    activeRunId,
    setActiveRunId,
    activeRunLogs,
    setActiveRunLogs,
    activeRunnerStep,
    setActiveRunnerStep,
    screenMode,
    setScreenMode,
    isFinishing,
    setIsFinishing,
    saveState,
    setSaveState,
    // UI state
    preferences,
    setPreferences,
    searchQuery,
    setSearchQuery,
    cycleType,
    setCycleType,
    // Helpers
    clearActiveRunState,
  };
}
