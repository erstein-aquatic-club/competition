import { useAuth } from "./auth";
import { supabase } from "./supabase";

// --- Types (re-exported from api/types.ts for backward compatibility) ---
export type {
  Session,
  Exercise,
  StrengthCycleType,
  StrengthSessionTemplate,
  StrengthSessionItem,
  SwimSessionTemplate,
  SwimSessionItem,
  Assignment,
  Notification,
  UserProfile,
  AthleteSummary,
  GroupSummary,
  UpcomingBirthday,
  UserSummary,
  SwimRecord,
  ClubRecord,
  ClubPerformanceRanked,
  ClubRecordSwimmer,
  TimesheetShift,
  TimesheetLocation,
  TimesheetGroupLabel,
  FeatureCapability,
  ApiCapabilities,
  ApiErrorInfo,
  SyncSessionInput,
  StrengthRunPayload,
  StrengthSetPayload,
  SwimmerPerformance,
  SplitTimeEntry,
  StrokeCountEntry,
  SwimExerciseLog,
  SwimExerciseLogInput,
  StrengthFolder,
  TeamAthletePlan,
  CoachAssignment,
  Competition,
  CompetitionInput,
  CompetitionAssignment,
  Objective,
  ObjectiveInput,
  PlannedAbsence,
  NeurotypResult,
  NeurotypScores,
  NeurotypCode,
  TrainingCycle,
  TrainingCycleInput,
  TrainingWeek,
  TrainingWeekInput,
  InterviewStatus,
  Interview,
  InterviewCreateInput,
  InterviewAthleteInput,
  InterviewCoachInput,
  TrainingSlot,
  TrainingSlotAssignment,
  TrainingSlotOverride,
  TrainingSlotInput,
  TrainingSlotOverrideInput,
  SwimmerTrainingSlot,
  SwimmerTrainingSlotInput,
  CompetitionRace,
  CompetitionRaceInput,
  RoutineTemplate,
  RoutineStep,
  RoutineStepInput,
  RaceRoutine,
  ChecklistTemplate,
  ChecklistItem,
  ChecklistItemInput,
  CompetitionChecklist,
  CompetitionChecklistCheck,
} from "./api/types";

import type {
  Session,
  ApiCapabilities,
} from "./api/types";

// --- Utilities (imported from api/client.ts) ---
import {
  canUseSupabase,
  STORAGE_KEYS,
  normalizeScaleToFive,
  expandScaleToTen,
  delay,
} from "./api/client";

// --- Helpers ---
import {
  mapToDbSession,
  mapFromDbSession,
  type SyncSessionInputWithId,
} from "./api/helpers";

// Re-export error utilities for backward compatibility
export { parseApiError, summarizeApiError } from "./api/client";

// Re-export audit module
export { getAuditLog, type AuditEntry } from "./api/audit";

// --- Delegated module imports ---
import {
  getProfile as _getProfile,
  updateProfile as _updateProfile,
  getAthletes as _getAthletes,
  getGroups as _getGroups,
  getUpcomingBirthdays as _getUpcomingBirthdays,
  listUsers as _listUsers,
  createCoach as _createCoach,
  updateUserRole as _updateUserRole,
  disableUser as _disableUser,
  getPendingApprovals as _getPendingApprovals,
  approveUser as _approveUser,
  rejectUser as _rejectUser,
  authPasswordUpdate as _authPasswordUpdate,
  uploadAvatar as _uploadAvatar,
  deleteAvatar as _deleteAvatar,
  getRecentSessionsAllAthletes as _getRecentSessionsAllAthletes,
} from "./api/users";

import {
  listTimesheetShifts as _listTimesheetShifts,
  listTimesheetLocations as _listTimesheetLocations,
  createTimesheetLocation as _createTimesheetLocation,
  deleteTimesheetLocation as _deleteTimesheetLocation,
  listTimesheetCoaches as _listTimesheetCoaches,
  createTimesheetShift as _createTimesheetShift,
  updateTimesheetShift as _updateTimesheetShift,
  deleteTimesheetShift as _deleteTimesheetShift,
  listTimesheetGroupLabels as _listTimesheetGroupLabels,
  createTimesheetGroupLabel as _createTimesheetGroupLabel,
  deleteTimesheetGroupLabel as _deleteTimesheetGroupLabel,
  listPermanentGroupsForTimesheet as _listPermanentGroupsForTimesheet,
} from "./api/timesheet";

import {
  getNotifications as _getNotifications,
  notifications_send as _notifications_send,
  markNotificationRead as _markNotificationRead,
  notifications_list as _notifications_list,
  notifications_mark_read as _notifications_mark_read,
} from "./api/notifications";

import { getNotificationLog as _getNotificationLog } from "./api/notificationLog";

import {
  getAssignmentsForCoach as _getAssignmentsForCoach,
  getAssignments as _getAssignments,
  getCoachAssignments as _getCoachAssignments,
  assignments_create as _assignments_create,
  assignments_delete as _assignments_delete,
  bulkCreateSlotAssignments as _bulkCreateSlotAssignments,
  getSlotAssignments as _getSlotAssignments,
  updateSlotVisibility as _updateSlotVisibility,
  deleteSlotAssignments as _deleteSlotAssignments,
} from "./api/assignments";

import {
  getSwimCatalog as _getSwimCatalog,
  createSwimSession as _createSwimSession,
  deleteSwimSession as _deleteSwimSession,
  archiveSwimSession as _archiveSwimSession,
  moveSwimSession as _moveSwimSession,
  migrateLocalStorageArchive as _migrateLocalStorageArchive,
  generateShareToken as _generateShareToken,
  getSharedSession as _getSharedSession,
} from "./api/swim";

import {
  getHallOfFame as _getHallOfFame,
  getClubRecords as _getClubRecords,
  getClubRecordSwimmers as _getClubRecordSwimmers,
  createClubRecordSwimmer as _createClubRecordSwimmer,
  updateClubRecordSwimmer as _updateClubRecordSwimmer,
  updateClubRecordSwimmerForUser as _updateClubRecordSwimmerForUser,
  importClubRecords as _importClubRecords,
  getImportLogs as _getImportLogs,
  importSingleSwimmer as _importSingleSwimmer,
  getSwimRecords as _getSwimRecords,
  upsertSwimRecord as _upsertSwimRecord,
  getSwimmerPerformances as _getSwimmerPerformances,
  importSwimmerPerformances as _importSwimmerPerformances,
  recalculateClubRecords as _recalculateClubRecords,
  getClubRanking as _getClubRanking,
  syncClubRecordSwimmersFromUsers as _syncClubRecordSwimmersFromUsers,
  mergeClubRecordSwimmers as _mergeClubRecordSwimmers,
  getAppSettings as _getAppSettings,
  updateAppSettings as _updateAppSettings,
} from "./api/records";

import {
  getSwimExerciseLogs as _getSwimExerciseLogs,
  getSwimExerciseLogsHistory as _getSwimExerciseLogsHistory,
  saveSwimExerciseLogs as _saveSwimExerciseLogs,
  createStandaloneSwimLog as _createStandaloneSwimLog,
  updateSwimExerciseLog as _updateSwimExerciseLog,
  deleteSwimExerciseLog as _deleteSwimExerciseLog,
} from "./api/swim-logs";

import {
  getTemporaryGroups as _getTemporaryGroups,
  getTemporaryGroupDetail as _getTemporaryGroupDetail,
  createTemporaryGroup as _createTemporaryGroup,
  addTemporaryGroupMembers as _addTemporaryGroupMembers,
  removeTemporaryGroupMember as _removeTemporaryGroupMember,
  deactivateTemporaryGroup as _deactivateTemporaryGroup,
  reactivateTemporaryGroup as _reactivateTemporaryGroup,
  deleteTemporaryGroup as _deleteTemporaryGroup,
} from "./api/temporary-groups";

import {
  getCompetitions as _getCompetitions,
  createCompetition as _createCompetition,
  updateCompetition as _updateCompetition,
  deleteCompetition as _deleteCompetition,
  getCompetitionAssignments as _getCompetitionAssignments,
  setCompetitionAssignments as _setCompetitionAssignments,
  getMyCompetitionIds as _getMyCompetitionIds,
} from './api/competitions';

import {
  getCompetitionRaces as _getCompetitionRaces,
  createCompetitionRace as _createCompetitionRace,
  updateCompetitionRace as _updateCompetitionRace,
  deleteCompetitionRace as _deleteCompetitionRace,
  getRoutineTemplates as _getRoutineTemplates,
  createRoutineTemplate as _createRoutineTemplate,
  deleteRoutineTemplate as _deleteRoutineTemplate,
  getRaceRoutines as _getRaceRoutines,
  setRaceRoutine as _setRaceRoutine,
  removeRaceRoutine as _removeRaceRoutine,
  getChecklistTemplates as _getChecklistTemplates,
  createChecklistTemplate as _createChecklistTemplate,
  deleteChecklistTemplate as _deleteChecklistTemplate,
  getCompetitionChecklist as _getCompetitionChecklist,
  applyChecklistTemplate as _applyChecklistTemplate,
  toggleChecklistCheck as _toggleChecklistCheck,
  removeCompetitionChecklist as _removeCompetitionChecklist,
} from './api/competition-prep';

import {
  getObjectives as _getObjectives,
  getAthleteObjectives as _getAthleteObjectives,
  createObjective as _createObjective,
  updateObjective as _updateObjective,
  deleteObjective as _deleteObjective,
  getObjectivesCountsByUser as _getObjectivesCountsByUser,
} from './api/objectives';

import {
  getPlannedAbsences as _getPlannedAbsences,
  getMyPlannedAbsences as _getMyPlannedAbsences,
  setPlannedAbsence as _setPlannedAbsence,
  removePlannedAbsence as _removePlannedAbsence,
} from './api/absences';

import {
  getTrainingCycles as _getTrainingCycles,
  createTrainingCycle as _createTrainingCycle,
  updateTrainingCycle as _updateTrainingCycle,
  deleteTrainingCycle as _deleteTrainingCycle,
  getTrainingWeeks as _getTrainingWeeks,
  upsertTrainingWeek as _upsertTrainingWeek,
  bulkUpsertTrainingWeeks as _bulkUpsertTrainingWeeks,
  deleteTrainingWeek as _deleteTrainingWeek,
} from './api/planning';

import {
  getInterviews as _getInterviews,
  getMyInterviews as _getMyInterviews,
  createInterview as _createInterview,
  updateInterviewAthleteSections as _updateInterviewAthleteSections,
  submitInterviewToCoach as _submitInterviewToCoach,
  updateInterviewCoachSections as _updateInterviewCoachSections,
  sendInterviewToAthlete as _sendInterviewToAthlete,
  signInterview as _signInterview,
  deleteInterview as _deleteInterview,
  getPreviousInterview as _getPreviousInterview,
  getAllPendingInterviews as _getAllPendingInterviews,
} from './api/interviews';

import {
  getTrainingSlots as _getTrainingSlots,
  getTrainingSlotsForGroup as _getTrainingSlotsForGroup,
  createTrainingSlot as _createTrainingSlot,
  updateTrainingSlot as _updateTrainingSlot,
  deleteTrainingSlot as _deleteTrainingSlot,
  getSlotOverrides as _getSlotOverrides,
  createSlotOverride as _createSlotOverride,
  deleteSlotOverride as _deleteSlotOverride,
} from './api/training-slots';

import {
  getSwimmerSlots as _getSwimmerSlots,
  hasCustomSlots as _hasCustomSlots,
  initSwimmerSlots as _initSwimmerSlots,
  createSwimmerSlot as _createSwimmerSlot,
  updateSwimmerSlot as _updateSwimmerSlot,
  deleteSwimmerSlot as _deleteSwimmerSlot,
  resetSwimmerSlots as _resetSwimmerSlots,
  getSwimmersAffectedBySlot as _getSwimmersAffectedBySlot,
} from "./api/swimmer-slots";

import {
  getExercises as _getExercises,
  createExercise as _createExercise,
  updateExercise as _updateExercise,
  deleteExercise as _deleteExercise,
  getStrengthSessions as _getStrengthSessions,
  createStrengthSession as _createStrengthSession,
  updateStrengthSession as _updateStrengthSession,
  persistStrengthSessionOrder as _persistStrengthSessionOrder,
  deleteStrengthSession as _deleteStrengthSession,
  startStrengthRun as _startStrengthRun,
  logStrengthSet as _logStrengthSet,
  updateStrengthRun as _updateStrengthRun,
  deleteStrengthRun as _deleteStrengthRun,
  saveStrengthRun as _saveStrengthRun,
  getStrengthHistory as _getStrengthHistory,
  getStrengthHistoryAggregate as _getStrengthHistoryAggregate,
  get1RM as _get1RM,
  update1RM as _update1RM,
  updateExerciseNote as _updateExerciseNote,
  getStrengthFolders as _getStrengthFolders,
  createStrengthFolder as _createStrengthFolder,
  renameStrengthFolder as _renameStrengthFolder,
  deleteStrengthFolder as _deleteStrengthFolder,
  moveToFolder as _moveToFolder,
  duplicateStrengthSession as _duplicateStrengthSession,
  duplicateFolder as _duplicateFolder,
  duplicateAthletePlan as _duplicateAthletePlan,
  getTeamAthletePlans as _getTeamAthletePlans,
} from "./api/strength";

// --- API Service ---

export const api = {
  // ── Capabilities ──
  async getCapabilities(): Promise<ApiCapabilities> {
    if (!canUseSupabase()) {
      return {
        mode: "local",
        version: null,
        timesheet: { available: true },
        messaging: { available: true },
      };
    }
    return {
      mode: "supabase",
      version: null,
      timesheet: { available: true },
      messaging: { available: true },
    };
  },

  // ── Swim Sessions (kept in api.ts) ──
  async syncSession(session: SyncSessionInputWithId): Promise<{ status: string; sessionId: number }> {
    if (canUseSupabase()) {
      const dbPayload = mapToDbSession(session);
      const { data, error } = await supabase.from("dim_sessions").insert(dbPayload).select("id").single();
      if (error) throw new Error(error.message);
      return { status: "ok", sessionId: data.id };
    }

    await delay(300);
    const sessions = this._get(STORAGE_KEYS.SESSIONS) || [];
    const newId = Date.now();
    const newSession = { ...session, id: newId, created_at: new Date().toISOString() };
    this._save(STORAGE_KEYS.SESSIONS, [...sessions, newSession]);
    return { status: "ok", sessionId: newId };
  },

  async ensureSwimSession(params: {
    athleteName: string;
    athleteId?: number | string | null;
    date: string;
    slot: string;
  }): Promise<number> {
    if (!canUseSupabase()) throw new Error("Supabase required");

    let query = supabase
      .from("dim_sessions")
      .select("id")
      .eq("session_date", params.date)
      .eq("time_slot", params.slot);

    if (params.athleteId) {
      query = query.eq("athlete_id", Number(params.athleteId));
    } else {
      query = query.eq("athlete_name", params.athleteName);
    }

    const { data: existing } = await query.maybeSingle();
    if (existing?.id) return existing.id as number;

    const payload: Record<string, unknown> = {
      athlete_name: params.athleteName,
      session_date: params.date,
      time_slot: params.slot,
      distance: 0,
      duration: 0,
      rpe: 10,
      performance: 10,
      engagement: 10,
      fatigue: 10,
    };
    if (params.athleteId) payload.athlete_id = Number(params.athleteId);

    const { data, error } = await supabase
      .from("dim_sessions")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as number;
  },

  async getSessions(athleteName: string, athleteId?: number | string | null): Promise<Session[]> {
    const hasAthleteId = athleteId !== null && athleteId !== undefined && String(athleteId) !== "";
    if (canUseSupabase()) {
      let query = supabase.from("dim_sessions").select("*").order("session_date", { ascending: false });
      if (hasAthleteId) {
        query = query.eq("athlete_id", Number(athleteId));
      } else {
        query = query.eq("athlete_name", athleteName);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map(mapFromDbSession)
        .filter((session): session is Session => Boolean(session));
    }

    await delay(200);
    const sessions = this._get(STORAGE_KEYS.SESSIONS) || [];
    return sessions
      .filter((s: Session) => {
        if (hasAthleteId) {
          return s.athlete_id ? String(s.athlete_id) === String(athleteId) : s.athlete_name.toLowerCase() === athleteName.toLowerCase();
        }
        return s.athlete_name.toLowerCase() === athleteName.toLowerCase();
      })
      .map((session: Session) => ({
        ...session,
        effort: normalizeScaleToFive(session.effort) ?? session.effort,
        feeling: normalizeScaleToFive(session.feeling) ?? session.feeling,
        rpe: normalizeScaleToFive(session.rpe ?? null),
        performance: normalizeScaleToFive(session.performance ?? null),
        engagement: normalizeScaleToFive(session.engagement ?? null),
        fatigue: normalizeScaleToFive(session.fatigue ?? null),
      }))
      .sort((a: Session, b: Session) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  async updateSession(session: Session): Promise<{ status: string }> {
    if (canUseSupabase()) {
      const dbPayload: Record<string, unknown> = {
        athlete_name: session.athlete_name,
        session_date: session.date,
        time_slot: session.slot,
        distance: session.distance,
        duration: session.duration,
        rpe: expandScaleToTen(session.effort),
        performance: expandScaleToTen(session.performance ?? session.feeling),
        engagement: expandScaleToTen(session.engagement ?? session.feeling),
        fatigue: expandScaleToTen(session.feeling),
        comments: session.comments,
      };
      const { error } = await supabase.from("dim_sessions").update(dbPayload).eq("id", session.id);
      if (error) throw new Error(error.message);
      return { status: "updated" };
    }

    await delay(200);
    const sessions = this._get(STORAGE_KEYS.SESSIONS) || [];
    const index = sessions.findIndex((entry: Session) => entry.id === session.id);
    if (index === -1) {
      return { status: "missing" };
    }
    const updatedSessions = [...sessions];
    updatedSessions[index] = { ...updatedSessions[index], ...session };
    this._save(STORAGE_KEYS.SESSIONS, updatedSessions);
    return { status: "updated" };
  },

  async deleteSession(sessionId: number): Promise<{ status: string }> {
    if (canUseSupabase()) {
      const { error } = await supabase.from("dim_sessions").delete().eq("id", sessionId);
      if (error) throw new Error(error.message);
      return { status: "deleted" };
    }

    await delay(200);
    const sessions = this._get(STORAGE_KEYS.SESSIONS) || [];
    const updatedSessions = sessions.filter((session: Session) => session.id !== sessionId);
    this._save(STORAGE_KEYS.SESSIONS, updatedSessions);
    return { status: "deleted" };
  },

  async updateSessionCoachNotes(sessionId: number, notes: string | null): Promise<void> {
    if (!canUseSupabase()) return;
    const { error } = await supabase
      .from("dim_sessions")
      .update({ coach_notes: notes })
      .eq("id", sessionId);
    if (error) throw new Error(error.message);
  },

  // ── Demo Seed (kept in api.ts) ──
  async seedDemoData() {
    const exercises = [
      { id: 1, nom_exercice: "Squat", description: "Flexion des jambes", exercise_type: "strength" },
      { id: 2, nom_exercice: "Développé Couché", description: "Poussée horizontale", exercise_type: "strength" },
      { id: 3, nom_exercice: "Tractions", description: "Tirage vertical", exercise_type: "strength" },
      { id: 4, nom_exercice: "Rotations Élastique", description: "Coiffe des rotateurs", exercise_type: "warmup" },
    ];
    this._save(STORAGE_KEYS.EXERCISES, exercises);

    const sSession = {
      id: 101, title: "Full Body A", description: "Séance globale", cycle: "Endurance",
      items: [
        { exercise_id: 4, exercise_name: "Rotations Élastique", category: "warmup", order_index: 0, sets: 2, reps: 15, rest_seconds: 30, percent_1rm: 0 },
        { exercise_id: 1, exercise_name: "Squat", category: "strength", order_index: 1, sets: 4, reps: 10, rest_seconds: 90, percent_1rm: 70 },
        { exercise_id: 2, exercise_name: "Développé Couché", category: "strength", order_index: 2, sets: 4, reps: 10, rest_seconds: 90, percent_1rm: 70 },
      ],
    };
    this._save(STORAGE_KEYS.STRENGTH_SESSIONS, [sSession]);

    const swSession = {
      id: 201,
      name: "VMA 100",
      description: "Travail de vitesse",
      created_by: 1,
      items: [
        { label: "Échauffement 4N", distance: 400, intensity: "Souple", notes: "Progressif" },
        { label: "Corps NL", distance: 1000, intensity: "Max", notes: "10x100 départ 1:30" },
      ],
    };
    this._save(STORAGE_KEYS.SWIM_SESSIONS, [swSession]);

    const today = new Date().toISOString().split("T")[0];
    await this.assignments_create({ session_id: 101, assignment_type: "strength", target_athlete: "Camille", assigned_date: today });

    return { status: "seeded" };
  },

  // ── Local Storage Utils (kept in api.ts) ──
  _get(key: string) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },

  _save(key: string, data: any) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  resetCache() {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Records
  // ══════════════════════════════════════════════════════════════════
  async getHallOfFame(fromDate?: string | null) { return _getHallOfFame(fromDate); },
  async getClubRecords(filters: Parameters<typeof _getClubRecords>[0]) { return _getClubRecords(filters); },
  async getClubRecordSwimmers() { return _getClubRecordSwimmers(); },
  async createClubRecordSwimmer(payload: Parameters<typeof _createClubRecordSwimmer>[0]) { return _createClubRecordSwimmer(payload); },
  async updateClubRecordSwimmer(id: number, payload: Parameters<typeof _updateClubRecordSwimmer>[1]) { return _updateClubRecordSwimmer(id, payload); },
  async updateClubRecordSwimmerForUser(userId: number, payload: Parameters<typeof _updateClubRecordSwimmerForUser>[1]) { return _updateClubRecordSwimmerForUser(userId, payload); },
  async importClubRecords() { return _importClubRecords(); },
  async getImportLogs(filters?: Parameters<typeof _getImportLogs>[0]) { return _getImportLogs(filters); },
  async importSingleSwimmer(swimmerIuf: string, swimmerName?: string) { return _importSingleSwimmer(swimmerIuf, swimmerName); },
  async getSwimRecords(options: Parameters<typeof _getSwimRecords>[0]) { return _getSwimRecords(options); },
  async upsertSwimRecord(payload: Parameters<typeof _upsertSwimRecord>[0]) { return _upsertSwimRecord(payload); },
  async getSwimmerPerformances(filters: Parameters<typeof _getSwimmerPerformances>[0]) { return _getSwimmerPerformances(filters); },
  async importSwimmerPerformances(params: Parameters<typeof _importSwimmerPerformances>[0]) { return _importSwimmerPerformances(params); },
  async recalculateClubRecords() { return _recalculateClubRecords(); },
  async getClubRanking(filters: Parameters<typeof _getClubRanking>[0]) { return _getClubRanking(filters); },
  async syncClubRecordSwimmersFromUsers() { return _syncClubRecordSwimmersFromUsers(); },
  async mergeClubRecordSwimmers(manualId: number, userSwimmerId: number) { return _mergeClubRecordSwimmers(manualId, userSwimmerId); },
  async getAppSettings(key: string) { return _getAppSettings(key); },
  async updateAppSettings(key: string, value: any) { return _updateAppSettings(key, value); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Strength
  // ══════════════════════════════════════════════════════════════════
  async getExercises() { return _getExercises(); },
  async createExercise(exercise: Parameters<typeof _createExercise>[0]) { return _createExercise(exercise); },
  async updateExercise(exercise: Parameters<typeof _updateExercise>[0]) { return _updateExercise(exercise); },
  async deleteExercise(exerciseId: number) { return _deleteExercise(exerciseId); },
  async getStrengthSessions() { return _getStrengthSessions(); },
  async createStrengthSession(session: any) { return _createStrengthSession(session); },
  async updateStrengthSession(session: any) { return _updateStrengthSession(session); },
  async persistStrengthSessionOrder(session: Parameters<typeof _persistStrengthSessionOrder>[0]) { return _persistStrengthSessionOrder(session); },
  async deleteStrengthSession(sessionId: number) { return _deleteStrengthSession(sessionId); },
  async startStrengthRun(data: Parameters<typeof _startStrengthRun>[0]) { return _startStrengthRun(data); },
  async logStrengthSet(payload: Parameters<typeof _logStrengthSet>[0]) { return _logStrengthSet(payload); },
  async updateStrengthRun(update: Parameters<typeof _updateStrengthRun>[0]) { return _updateStrengthRun(update); },
  async deleteStrengthRun(runId: number) { return _deleteStrengthRun(runId); },
  async saveStrengthRun(run: any) { return _saveStrengthRun(run); },
  async getStrengthHistory(athleteName: string, options?: Parameters<typeof _getStrengthHistory>[1]) { return _getStrengthHistory(athleteName, options); },
  async getStrengthHistoryAggregate(athleteName: string, options?: Parameters<typeof _getStrengthHistoryAggregate>[1]) { return _getStrengthHistoryAggregate(athleteName, options); },
  async get1RM(athlete: Parameters<typeof _get1RM>[0]) { return _get1RM(athlete); },
  async update1RM(record: Parameters<typeof _update1RM>[0]) { return _update1RM(record); },
  async updateExerciseNote(params: Parameters<typeof _updateExerciseNote>[0]) { return _updateExerciseNote(params); },
  async getStrengthFolders(type: 'session' | 'exercise', opts?: Parameters<typeof _getStrengthFolders>[1]) { return _getStrengthFolders(type, opts); },
  async createStrengthFolder(name: string, type: 'session' | 'exercise', opts?: Parameters<typeof _createStrengthFolder>[2]) { return _createStrengthFolder(name, type, opts); },
  async renameStrengthFolder(id: number, name: string) { return _renameStrengthFolder(id, name); },
  async deleteStrengthFolder(id: number) { return _deleteStrengthFolder(id); },
  async moveToFolder(itemId: number, folderId: number | null, table: 'strength_sessions' | 'dim_exercices') { return _moveToFolder(itemId, folderId, table); },
  async duplicateStrengthSession(sessionId: number, targetFolderId: number | null) { return _duplicateStrengthSession(sessionId, targetFolderId); },
  async duplicateFolder(folderId: number, targetAthleteId: number | null, targetParentId: number | null) { return _duplicateFolder(folderId, targetAthleteId, targetParentId); },
  async duplicateAthletePlan(sourceAthleteId: number, targetAthleteId: number) { return _duplicateAthletePlan(sourceAthleteId, targetAthleteId); },
  async getTeamAthletePlans(excludeAthleteId: number) { return _getTeamAthletePlans(excludeAthleteId); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Swim Exercise Logs
  // ══════════════════════════════════════════════════════════════════
  async getSwimExerciseLogs(sessionId: number) { return _getSwimExerciseLogs(sessionId); },
  async getSwimExerciseLogsHistory(userId: string, limit?: number) { return _getSwimExerciseLogsHistory(userId, limit); },
  async saveSwimExerciseLogs(sessionId: number, userId: string, logs: Parameters<typeof _saveSwimExerciseLogs>[2]) { return _saveSwimExerciseLogs(sessionId, userId, logs); },
  async createStandaloneSwimLog(userId: string, log: Parameters<typeof _createStandaloneSwimLog>[1]) { return _createStandaloneSwimLog(userId, log); },
  async updateSwimExerciseLog(logId: string, patch: Parameters<typeof _updateSwimExerciseLog>[1]) { return _updateSwimExerciseLog(logId, patch); },
  async deleteSwimExerciseLog(logId: string) { return _deleteSwimExerciseLog(logId); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Swim Catalog
  // ══════════════════════════════════════════════════════════════════
  async getSwimCatalog() { return _getSwimCatalog(); },
  async createSwimSession(session: any) { return _createSwimSession(session); },
  async deleteSwimSession(sessionId: number) { return _deleteSwimSession(sessionId); },
  async archiveSwimSession(sessionId: number, archived: boolean) { return _archiveSwimSession(sessionId, archived); },
  async moveSwimSession(sessionId: number, folder: string | null) { return _moveSwimSession(sessionId, folder); },
  async migrateLocalStorageArchive(archivedIds: number[]) { return _migrateLocalStorageArchive(archivedIds); },
  async generateShareToken(catalogId: number) { return _generateShareToken(catalogId); },
  async getSharedSession(token: string) { return _getSharedSession(token); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Assignments
  // ══════════════════════════════════════════════════════════════════
  async getAssignmentsForCoach() { return _getAssignmentsForCoach(); },
  async getCoachAssignments(filters: Parameters<typeof _getCoachAssignments>[0]) { return _getCoachAssignments(filters); },
  async getAssignments(athleteName: string, athleteId?: number | null, options?: Parameters<typeof _getAssignments>[2]) { return _getAssignments(athleteName, athleteId, options); },
  async assignments_create(data: Parameters<typeof _assignments_create>[0]) {
    const currentUserId = useAuth.getState().userId;
    return _assignments_create(data, currentUserId);
  },
  async assignments_delete(assignmentId: number) { return _assignments_delete(assignmentId); },
  async bulkCreateSlotAssignments(params: Parameters<typeof _bulkCreateSlotAssignments>[0]) { return _bulkCreateSlotAssignments(params); },
  async getSlotAssignments(params: Parameters<typeof _getSlotAssignments>[0]) { return _getSlotAssignments(params); },
  async updateSlotVisibility(params: Parameters<typeof _updateSlotVisibility>[0]) { return _updateSlotVisibility(params); },
  async deleteSlotAssignments(params: Parameters<typeof _deleteSlotAssignments>[0]) { return _deleteSlotAssignments(params); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Notifications
  // ══════════════════════════════════════════════════════════════════
  async getNotifications(athleteName: string) { return _getNotifications(athleteName); },
  async notifications_send(payload: Parameters<typeof _notifications_send>[0]) { return _notifications_send(payload); },
  async markNotificationRead(id: number) { return _markNotificationRead(id); },
  async notifications_list(options: Parameters<typeof _notifications_list>[0]) { return _notifications_list(options); },
  async notifications_mark_read(payload: Parameters<typeof _notifications_mark_read>[0]) { return _notifications_mark_read(payload); },
  async getNotificationLog(limit?: number, offset?: number) { return _getNotificationLog(limit, offset); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Timesheet
  // ══════════════════════════════════════════════════════════════════
  async listTimesheetShifts(options?: Parameters<typeof _listTimesheetShifts>[0]) { return _listTimesheetShifts(options); },
  async listTimesheetLocations() { return _listTimesheetLocations(); },
  async createTimesheetLocation(payload: Parameters<typeof _createTimesheetLocation>[0]) { return _createTimesheetLocation(payload); },
  async deleteTimesheetLocation(payload: Parameters<typeof _deleteTimesheetLocation>[0]) { return _deleteTimesheetLocation(payload); },
  async listTimesheetCoaches() { return _listTimesheetCoaches(); },
  async createTimesheetShift(payload: Parameters<typeof _createTimesheetShift>[0]) { return _createTimesheetShift(payload); },
  async updateTimesheetShift(payload: Parameters<typeof _updateTimesheetShift>[0]) { return _updateTimesheetShift(payload); },
  async deleteTimesheetShift(payload: Parameters<typeof _deleteTimesheetShift>[0]) { return _deleteTimesheetShift(payload); },
  async listTimesheetGroupLabels() { return _listTimesheetGroupLabels(); },
  async createTimesheetGroupLabel(payload: Parameters<typeof _createTimesheetGroupLabel>[0]) { return _createTimesheetGroupLabel(payload); },
  async deleteTimesheetGroupLabel(payload: Parameters<typeof _deleteTimesheetGroupLabel>[0]) { return _deleteTimesheetGroupLabel(payload); },
  async listPermanentGroupsForTimesheet() { return _listPermanentGroupsForTimesheet(); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Temporary Groups
  // ══════════════════════════════════════════════════════════════════
  async getTemporaryGroups() { return _getTemporaryGroups(); },
  async getTemporaryGroupDetail(groupId: number) { return _getTemporaryGroupDetail(groupId); },
  async createTemporaryGroup(data: Parameters<typeof _createTemporaryGroup>[0]) { return _createTemporaryGroup(data); },
  async addTemporaryGroupMembers(groupId: number, userIds: number[]) { return _addTemporaryGroupMembers(groupId, userIds); },
  async removeTemporaryGroupMember(groupId: number, userId: number) { return _removeTemporaryGroupMember(groupId, userId); },
  async deactivateTemporaryGroup(groupId: number) { return _deactivateTemporaryGroup(groupId); },
  async reactivateTemporaryGroup(groupId: number) { return _reactivateTemporaryGroup(groupId); },
  async deleteTemporaryGroup(groupId: number) { return _deleteTemporaryGroup(groupId); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Competitions
  // ══════════════════════════════════════════════════════════════════
  async getCompetitions() { return _getCompetitions(); },
  async createCompetition(input: Parameters<typeof _createCompetition>[0]) { return _createCompetition(input); },
  async updateCompetition(id: string, input: Parameters<typeof _updateCompetition>[1]) { return _updateCompetition(id, input); },
  async deleteCompetition(id: string) { return _deleteCompetition(id); },
  async getCompetitionAssignments(competitionId: string) { return _getCompetitionAssignments(competitionId); },
  async setCompetitionAssignments(competitionId: string, athleteIds: number[]) { return _setCompetitionAssignments(competitionId, athleteIds); },
  async getMyCompetitionIds(athleteId?: number | null) { return _getMyCompetitionIds(athleteId); },

  // ── Competition Prep (Races, Routines, Checklists) ─────────────
  async getCompetitionRaces(competitionId: string) { return _getCompetitionRaces(competitionId); },
  async createCompetitionRace(input: Parameters<typeof _createCompetitionRace>[0]) { return _createCompetitionRace(input); },
  async updateCompetitionRace(id: string, input: Parameters<typeof _updateCompetitionRace>[1]) { return _updateCompetitionRace(id, input); },
  async deleteCompetitionRace(id: string) { return _deleteCompetitionRace(id); },
  async getRoutineTemplates() { return _getRoutineTemplates(); },
  async createRoutineTemplate(name: string, steps: Parameters<typeof _createRoutineTemplate>[1]) { return _createRoutineTemplate(name, steps); },
  async deleteRoutineTemplate(id: string) { return _deleteRoutineTemplate(id); },
  async getRaceRoutines(competitionId: string) { return _getRaceRoutines(competitionId); },
  async setRaceRoutine(raceId: string, routineId: string) { return _setRaceRoutine(raceId, routineId); },
  async removeRaceRoutine(raceId: string) { return _removeRaceRoutine(raceId); },
  async getChecklistTemplates() { return _getChecklistTemplates(); },
  async createChecklistTemplate(name: string, items: Parameters<typeof _createChecklistTemplate>[1]) { return _createChecklistTemplate(name, items); },
  async deleteChecklistTemplate(id: string) { return _deleteChecklistTemplate(id); },
  async getCompetitionChecklist(competitionId: string) { return _getCompetitionChecklist(competitionId); },
  async applyChecklistTemplate(competitionId: string, templateId: string) { return _applyChecklistTemplate(competitionId, templateId); },
  async toggleChecklistCheck(checkId: string, checked: boolean) { return _toggleChecklistCheck(checkId, checked); },
  async removeCompetitionChecklist(id: string) { return _removeCompetitionChecklist(id); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Objectives
  // ══════════════════════════════════════════════════════════════════
  async getObjectives(athleteId?: string) { return _getObjectives(athleteId); },
  async getAthleteObjectives() { return _getAthleteObjectives(); },
  async createObjective(input: Parameters<typeof _createObjective>[0]) { return _createObjective(input); },
  async updateObjective(id: string, input: Parameters<typeof _updateObjective>[1]) { return _updateObjective(id, input); },
  async deleteObjective(id: string) { return _deleteObjective(id); },
  async getObjectivesCountsByUser() { return _getObjectivesCountsByUser(); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Planned Absences
  // ══════════════════════════════════════════════════════════════════
  async getPlannedAbsences(options?: Parameters<typeof _getPlannedAbsences>[0]) { return _getPlannedAbsences(options); },
  async getMyPlannedAbsences() { return _getMyPlannedAbsences(); },
  async setPlannedAbsence(date: string, reason?: string | null) { return _setPlannedAbsence(date, reason); },
  async removePlannedAbsence(date: string) { return _removePlannedAbsence(date); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Training Planning
  // ══════════════════════════════════════════════════════════════════
  async getTrainingCycles(opts?: Parameters<typeof _getTrainingCycles>[0]) { return _getTrainingCycles(opts); },
  async createTrainingCycle(input: Parameters<typeof _createTrainingCycle>[0]) { return _createTrainingCycle(input); },
  async updateTrainingCycle(id: string, input: Parameters<typeof _updateTrainingCycle>[1]) { return _updateTrainingCycle(id, input); },
  async deleteTrainingCycle(id: string) { return _deleteTrainingCycle(id); },
  async getTrainingWeeks(cycleId: string) { return _getTrainingWeeks(cycleId); },
  async upsertTrainingWeek(input: Parameters<typeof _upsertTrainingWeek>[0]) { return _upsertTrainingWeek(input); },
  async bulkUpsertTrainingWeeks(weeks: Parameters<typeof _bulkUpsertTrainingWeeks>[0]) { return _bulkUpsertTrainingWeeks(weeks); },
  async deleteTrainingWeek(id: string) { return _deleteTrainingWeek(id); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Interviews
  // ══════════════════════════════════════════════════════════════════
  async getInterviews(athleteId: number) { return _getInterviews(athleteId); },
  async getMyInterviews() { return _getMyInterviews(); },
  async createInterview(input: Parameters<typeof _createInterview>[0]) { return _createInterview(input); },
  async updateInterviewAthleteSections(id: string, input: Parameters<typeof _updateInterviewAthleteSections>[1]) { return _updateInterviewAthleteSections(id, input); },
  async submitInterviewToCoach(id: string) { return _submitInterviewToCoach(id); },
  async updateInterviewCoachSections(id: string, input: Parameters<typeof _updateInterviewCoachSections>[1]) { return _updateInterviewCoachSections(id, input); },
  async sendInterviewToAthlete(id: string) { return _sendInterviewToAthlete(id); },
  async signInterview(id: string) { return _signInterview(id); },
  async deleteInterview(id: string) { return _deleteInterview(id); },
  async getPreviousInterview(athleteId: number, beforeDate: string, excludeId?: string) { return _getPreviousInterview(athleteId, beforeDate, excludeId); },
  async getAllPendingInterviews() { return _getAllPendingInterviews(); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Users
  // ══════════════════════════════════════════════════════════════════
  async getProfile(options: Parameters<typeof _getProfile>[0]) { return _getProfile(options); },
  async updateProfile(payload: Parameters<typeof _updateProfile>[0]) { return _updateProfile(payload); },
  async getAthletes() { return _getAthletes(); },
  async getGroups() { return _getGroups(); },
  async getUpcomingBirthdays(options?: Parameters<typeof _getUpcomingBirthdays>[0]) { return _getUpcomingBirthdays(options); },
  async listUsers(options?: Parameters<typeof _listUsers>[0]) { return _listUsers(options); },
  async createCoach(payload: Parameters<typeof _createCoach>[0]) { return _createCoach(payload); },
  async updateUserRole(payload: Parameters<typeof _updateUserRole>[0]) { return _updateUserRole(payload); },
  async disableUser(payload: Parameters<typeof _disableUser>[0]) { return _disableUser(payload); },
  async getPendingApprovals() { return _getPendingApprovals(); },
  async approveUser(userId: number) { return _approveUser(userId); },
  async rejectUser(userId: number) { return _rejectUser(userId); },
  async authPasswordUpdate(payload: Parameters<typeof _authPasswordUpdate>[0]) { return _authPasswordUpdate(payload); },
  async uploadAvatar(payload: Parameters<typeof _uploadAvatar>[0]) { return _uploadAvatar(payload); },
  async deleteAvatar(userId: number) { return _deleteAvatar(userId); },
  async getRecentSessionsAllAthletes(days?: number) { return _getRecentSessionsAllAthletes(days); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Training Slots
  // ══════════════════════════════════════════════════════════════════
  async getTrainingSlots() { return _getTrainingSlots(); },
  async getTrainingSlotsForGroup(groupId: number) { return _getTrainingSlotsForGroup(groupId); },
  async createTrainingSlot(input: Parameters<typeof _createTrainingSlot>[0]) { return _createTrainingSlot(input); },
  async updateTrainingSlot(slotId: string, input: Parameters<typeof _updateTrainingSlot>[1]) { return _updateTrainingSlot(slotId, input); },
  async deleteTrainingSlot(slotId: string) { return _deleteTrainingSlot(slotId); },
  async getSlotOverrides(options?: Parameters<typeof _getSlotOverrides>[0]) { return _getSlotOverrides(options); },
  async createSlotOverride(input: Parameters<typeof _createSlotOverride>[0]) { return _createSlotOverride(input); },
  async deleteSlotOverride(overrideId: string) { return _deleteSlotOverride(overrideId); },

  // ══════════════════════════════════════════════════════════════════
  // DELEGATION STUBS — Swimmer Training Slots
  // ══════════════════════════════════════════════════════════════════
  async getSwimmerSlots(userId: number) { return _getSwimmerSlots(userId); },
  async hasCustomSlots(userId: number) { return _hasCustomSlots(userId); },
  async initSwimmerSlots(userId: number, groupId: number, createdBy: number) { return _initSwimmerSlots(userId, groupId, createdBy); },
  async createSwimmerSlot(input: Parameters<typeof _createSwimmerSlot>[0], createdBy: number) { return _createSwimmerSlot(input, createdBy); },
  async updateSwimmerSlot(slotId: string, input: Parameters<typeof _updateSwimmerSlot>[1]) { return _updateSwimmerSlot(slotId, input); },
  async deleteSwimmerSlot(slotId: string) { return _deleteSwimmerSlot(slotId); },
  async resetSwimmerSlots(userId: number, groupId: number, createdBy: number) { return _resetSwimmerSlots(userId, groupId, createdBy); },
  async getSwimmersAffectedBySlot(assignmentId: string) { return _getSwimmersAffectedBySlot(assignmentId); },
};
