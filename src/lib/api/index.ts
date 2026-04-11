/**
 * API Module - Centralized export
 *
 * This module provides a modular structure for the API layer.
 *
 * Structure:
 * - types.ts - All TypeScript interfaces
 * - client.ts - Supabase client, utilities, and helpers
 * - helpers.ts - Mapping functions and internal types
 * - transformers.ts - Strength data payload transformers
 * - localStorage.ts - Fallback storage for offline mode
 * - users.ts - Profile, athletes, users, groups
 * - timesheet.ts - Timesheet shifts, locations, coaches
 * - notifications.ts - Notification CRUD
 * - assignments.ts - Assignment CRUD
 * - swim.ts - Swim catalog sessions
 * - records.ts - Hall of fame, club records, swim records, performances
 * - strength.ts - Exercises, strength sessions, runs, history, 1RM
 */

// Re-export types
export * from './types';

// Re-export helpers
export {
  normalizeExercise,
  mapToDbSession,
  mapFromDbSession,
  type Pagination,
  type NotificationListResult,
  type StrengthExerciseSummary,
  type StrengthHistoryResult,
  type StrengthHistoryAggregateEntry,
  type StrengthHistoryAggregateResult,
  type SyncSessionInputWithId,
} from './helpers';

// Re-export client utilities
export {
  isNetworkAvailable,
  canUseSupabase,
  supabase,
  STORAGE_KEYS,
  safeInt,
  safeOptionalInt,
  safeOptionalNumber,
  normalizeScaleToFive,
  expandScaleToTen,
  estimateOneRm,
  parseApiError,
  summarizeApiError,
  normalizeCycleType,
  normalizeExerciseType,
  normalizeStrengthItem,
  validateStrengthItems,
  mapDbExerciseToApi,
  mapApiExerciseToDb,
  delay,
  parseRawPayload,
  fetchUserGroupIds,
  partitionGroupIds,
  fetchUserGroupIdsWithContext,
  BODYWEIGHT_SENTINEL,
  isBodyweight,
} from './client';

// Re-export localStorage utilities
export {
  localStorageGet,
  localStorageSave,
  localStorageRemove,
  resetLocalStorageCache,
  storage,
} from './localStorage';

// Re-export transformers
export {
  prepareStrengthItemsPayload,
  mapItemsForDbInsert,
  createLocalStrengthRun,
  createSetLogDbPayload,
  buildRunUpdatePayload,
  collectEstimated1RMs,
  enrichItemsWithExerciseNames,
  mapLogsForDbInsert,
  type PreparedStrengthItems,
  type DbStrengthItemPayload,
} from './transformers';

// Re-export main api object from legacy file
export { api } from '../api';

// Re-export extracted modules
export {
  getProfile,
  updateProfile,
  getAthletes,
  getAthletesPaginated,
  getGroups,
  getUpcomingBirthdays,
  listUsers,
  createCoach,
  updateUserRole,
  disableUser,
  getPendingApprovals,
  approveUser,
  rejectUser,
  authPasswordUpdate,
  uploadAvatar,
  deleteAvatar,
  getRecentSessionsAllAthletes,
} from './users';

export {
  listTimesheetShifts,
  listTimesheetLocations,
  createTimesheetLocation,
  deleteTimesheetLocation,
  listTimesheetCoaches,
  createTimesheetShift,
  updateTimesheetShift,
  deleteTimesheetShift,
  listTimesheetGroupLabels,
  createTimesheetGroupLabel,
  deleteTimesheetGroupLabel,
  getShiftGroupNames,
  setShiftGroupNames,
  listPermanentGroupsForTimesheet,
} from './timesheet';

export {
  getNotifications,
  notifications_send,
  markNotificationRead,
  notifications_list,
  notifications_mark_read,
} from './notifications';

export {
  getNotificationLog,
  type NotificationLogEntry,
} from './notificationLog';

export {
  getAssignmentsForCoach,
  getAssignments,
  getCoachAssignments,
  assignments_create,
  assignments_delete,
  deriveScheduledSlot,
  bulkCreateSlotAssignments,
  getSlotAssignments,
  updateSlotVisibility,
  deleteSlotAssignments,
} from './assignments';

export {
  getSwimCatalog,
  getSwimSessionsPaginated,
  createSwimSession,
  deleteSwimSession,
  archiveSwimSession,
  moveSwimSession,
  migrateLocalStorageArchive,
  generateShareToken,
  getSharedSession,
  getSwimCatalogFolders,
  createSwimCatalogFolder,
  renameSwimCatalogFolder,
  deleteSwimCatalogFolder,
} from './swim';

export {
  getHallOfFame,
  getClubRecords,
  getClubRecordSwimmers,
  createClubRecordSwimmer,
  updateClubRecordSwimmer,
  updateClubRecordSwimmerForUser,
  importClubRecords,
  getImportLogs,
  importSingleSwimmer,
  getSwimRecords,
  upsertSwimRecord,
  deleteSwimRecord,
  getSwimmerPerformances,
  importSwimmerPerformances,
  recalculateClubRecords,
  getClubRanking,
  syncClubRecordSwimmersFromUsers,
  mergeClubRecordSwimmers,
  getAppSettings,
  updateAppSettings,
} from './records';

export {
  getSwimExerciseLogs,
  getSwimExerciseLogsHistory,
  saveSwimExerciseLogs,
  createStandaloneSwimLog,
  updateSwimExerciseLog,
  deleteSwimExerciseLog,
} from './swim-logs';

export {
  getTemporaryGroups,
  getTemporaryGroupDetail,
  createTemporaryGroup,
  addTemporaryGroupMembers,
  removeTemporaryGroupMember,
  deactivateTemporaryGroup,
  reactivateTemporaryGroup,
  deleteTemporaryGroup,
} from './temporary-groups';

export {
  getCompetitions,
  createCompetition,
  updateCompetition,
  deleteCompetition,
  getCompetitionAssignments,
  setCompetitionAssignments,
  getMyCompetitionIds,
} from './competitions';

export {
  getObjectives,
  getAthleteObjectives,
  createObjective,
  updateObjective,
  deleteObjective,
  getObjectivesCountsByUser,
} from './objectives';

export {
  getPlannedAbsences,
  getMyPlannedAbsences,
  setPlannedAbsence,
  removePlannedAbsence,
} from './absences';

export {
  getTrainingCycles,
  createTrainingCycle,
  updateTrainingCycle,
  deleteTrainingCycle,
  getTrainingWeeks,
  upsertTrainingWeek,
  bulkUpsertTrainingWeeks,
  deleteTrainingWeek,
} from './planning';

export {
  getInterviews,
  getMyInterviews,
  createInterview,
  updateInterviewAthleteSections,
  submitInterviewToCoach,
  updateInterviewCoachSections,
  sendInterviewToAthlete,
  signInterview,
  deleteInterview,
  getPreviousInterview,
  getAllPendingInterviews,
} from './interviews';

export {
  getTrainingSlots,
  getTrainingSlotsForGroup,
  createTrainingSlot,
  updateTrainingSlot,
  deleteTrainingSlot,
  getSlotOverrides,
  createSlotOverride,
  deleteSlotOverride,
} from './training-slots';

export {
  getSwimmerSlots,
  hasCustomSlots,
  initSwimmerSlots,
  createSwimmerSlot,
  updateSwimmerSlot,
  deleteSwimmerSlot,
  resetSwimmerSlots,
  getSwimmersAffectedBySlot,
} from './swimmer-slots';

export {
  getCompetitionRaces,
  createCompetitionRace,
  updateCompetitionRace,
  deleteCompetitionRace,
  getRoutineTemplates,
  createRoutineTemplate,
  deleteRoutineTemplate,
  getRaceRoutines,
  setRaceRoutine,
  removeRaceRoutine,
  getChecklistTemplates,
  createChecklistTemplate,
  deleteChecklistTemplate,
  getCompetitionChecklist,
  applyChecklistTemplate,
  toggleChecklistCheck,
  removeCompetitionChecklist,
} from './competition-prep';

export {
  getAuditLog,
  type AuditEntry,
} from './audit';

export {
  computeReadinessScore,
  getWellnessForDate,
  getWellnessRange,
  getGroupWellnessForDate,
  upsertWellness,
} from './wellness';

export {
  getUserAchievements,
  unlockAchievement,
} from './achievements';

export {
  getActiveChallenges,
  getAllChallenges,
  createChallenge,
  updateChallengeProgress,
  deleteChallenge,
} from './challenges';

export {
  getPainReportsForDate,
  getPainReportsRange,
  upsertPainReports,
} from './painReports';

// Swim planning
export {
  getSwimPlanningSlots,
  upsertSwimPlanningSlot,
  deleteSwimPlanningSlot,
} from './swim-planning';

// Swim filières
export {
  getSwimFilieres,
  updateSwimFiliere,
} from './swim-filieres';

// Coach assignments
export {
  getMySwimmers,
  getAllAssignments,
  assignSwimmer,
  unassignSwimmer,
  reassignSwimmer,
  getSwimmerCoachHistory,
} from './coach-assignments';

export {
  getExercises,
  createExercise,
  getStrengthSessionsPaginated,
  updateExercise,
  deleteExercise,
  getStrengthSessions,
  createStrengthSession,
  updateStrengthSession,
  persistStrengthSessionOrder,
  deleteStrengthSession,
  startStrengthRun,
  logStrengthSet,
  updateStrengthRun,
  deleteStrengthRun,
  saveStrengthRun,
  getStrengthHistory,
  getStrengthHistoryAggregate,
  get1RM,
  update1RM,
  updateExerciseNote,
  getStrengthFolders,
  getTeamAthletePlans,
  createStrengthFolder,
  renameStrengthFolder,
  deleteStrengthFolder,
  moveToFolder,
  duplicateStrengthSession,
  duplicateFolder,
  duplicateAthletePlan,
  getAllOneRmRecords,
  getPopularExercises,
} from './strength';

// Coach comments (read/unread tracking)
export {
  getSwimmerComments,
  markCommentsRead,
  countUnreadComments48h,
  type SwimmerComment,
  type GetSwimmerCommentsOptions,
} from './coach-comments';

// Chrono records
export {
  getChronoRecords,
  createChronoRecord,
  updateChronoRecord,
  deleteChronoRecord,
} from './chrono-records';
