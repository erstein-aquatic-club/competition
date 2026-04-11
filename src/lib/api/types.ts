// API Types - All TypeScript interfaces for the API layer

export type StrokeDistances = {
  NL?: number;
  DOS?: number;
  BR?: number;
  PAP?: number;
  QN?: number;
};

export interface Session {
  id: number;
  athlete_id?: number;
  athlete_name: string;
  date: string;
  slot: string;
  effort: number;
  feeling: number;
  rpe?: number | null;
  performance?: number | null;
  engagement?: number | null;
  fatigue?: number | null;
  distance: number;
  duration: number;
  comments: string;
  coach_notes?: string | null;
  stroke_distances?: StrokeDistances | null;
  created_at: string;
}

export interface Exercise {
  id: number;
  name?: string;
  numero_exercice?: number | null;
  nom_exercice: string;
  description?: string | null;
  illustration_gif?: string | null;
  exercise_type: "strength" | "warmup";
  warmup_reps?: number | null;
  warmup_duration?: number | null;
  Nb_series_endurance?: number | null;
  Nb_reps_endurance?: number | null;
  pct_1rm_endurance?: number | null;
  recup_endurance?: number | null;
  recup_exercices_endurance?: number | null;
  Nb_series_hypertrophie?: number | null;
  Nb_reps_hypertrophie?: number | null;
  pct_1rm_hypertrophie?: number | null;
  recup_hypertrophie?: number | null;
  recup_exercices_hypertrophie?: number | null;
  Nb_series_force?: number | null;
  Nb_reps_force?: number | null;
  pct_1rm_force?: number | null;
  recup_force?: number | null;
  recup_exercices_force?: number | null;
  folder_id?: number | null;
}

export type StrengthCycleType = "endurance" | "hypertrophie" | "force";

export interface StrengthSessionTemplate {
  id: number;
  title: string;
  name?: string;
  description: string;
  cycle: StrengthCycleType;
  cycle_type?: StrengthCycleType | null;
  items?: StrengthSessionItem[];
  folder_id?: number | null;
}

export interface StrengthSessionItem {
  exercise_id: number;
  order_index: number;
  sets: number;
  reps: number;
  rest_seconds: number;
  percent_1rm: number;
  cycle_type?: StrengthCycleType | null;
  notes?: string;
  exercise_name?: string;
  category?: string;
}

export interface StrengthFolder {
  id: number;
  name: string;
  type: 'session' | 'exercise';
  sort_order: number;
  parent_id?: number | null;
  athlete_id?: number | null;
}

export interface TeamAthletePlan {
  athleteId: number;
  athleteName: string;
  folders: StrengthFolder[];
}

export interface SwimSessionTemplate {
  id: number;
  name: string;
  description?: string | null;
  created_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  folder?: string | null;
  is_archived?: boolean;
  items?: SwimSessionItem[];
}

export interface SwimCatalogFolder {
  id: number;
  path: string;
  created_by?: number | null;
  created_at?: string | null;
}

export interface SwimSessionItem {
  id?: number;
  catalog_id?: number;
  ordre?: number;
  label?: string | null;
  distance?: number | null;
  duration?: number | null;
  intensity?: string | null;
  notes?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

export interface Assignment {
  id: number;
  session_id: number;
  session_type: "swim" | "strength";
  title: string;
  description: string;
  assigned_date: string;
  status: string;
  items?: StrengthSessionItem[] | SwimSessionItem[];
  cycle?: string;
}

export interface Notification {
  id: number;
  notification_id?: number | null;
  target_id?: number;
  target_user_id?: number | null;
  target_group_id?: number | null;
  target_group_name?: string | null;
  sender_id?: number | null;
  sender_email?: string | null;
  sender_name?: string | null;
  sender_role?: string | null;
  counterparty_id?: number | null;
  counterparty_name?: string | null;
  counterparty_role?: string | null;
  sender: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  date: string;
  metadata?: Record<string, unknown> | null;
  related_id?: number;
}

export interface UserProfile {
  id?: number | null;
  display_name?: string;
  email?: string | null;
  birthdate?: string | null;
  group_id?: number | null;
  group_label?: string | null;
  objectives?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  ffn_iuf?: string | null;
  phone?: string | null;
  neurotype_result?: NeurotypResult | null;
  body_weight?: number | null;
}

export interface AthleteSummary {
  id: number | null;
  display_name: string;
  email?: string | null;
  group_id?: number | null;
  group_label?: string | null;
  ffn_iuf?: string | null;
  avatar_url?: string | null;
}

export interface CoachSwimmerAssignment {
  id: number;
  coach_id: number;
  swimmer_id: number;
  assigned_at: string;
  assigned_by: number;
}

export interface CoachSwimmerHistory {
  id: number;
  coach_id: number;
  swimmer_id: number;
  assigned_at: string;
  removed_at: string;
  removed_by: number | null;
}

export interface GroupSummary {
  id: number;
  name: string;
  member_count?: number | null;
  is_temporary?: boolean;
  is_active?: boolean;
  parent_group_id?: number | null;
}

export interface UpcomingBirthday {
  id: number;
  display_name: string;
  birthdate: string;
  next_birthday: string;
  days_until: number;
}

export interface UserSummary {
  id: number;
  display_name: string;
  role: string;
  email?: string | null;
  is_active?: number | boolean;
  group_label?: string | null;
}

export interface SwimRecord {
  id: number;
  athlete_id: number;
  athlete_name?: string | null;
  event_name: string;
  pool_length?: number | null;
  time_seconds?: number | null;
  record_date?: string | null;
  notes?: string | null;
  record_type?: string | null;
  ffn_points?: number | null;
  points?: number | null;
}

export interface ClubRecord {
  id: number;
  performance_id: number;
  athlete_name: string;
  swimmer_iuf?: string | null;
  sex: string;
  pool_m: number;
  event_code: string;
  event_label?: string | null;
  age: number;
  original_age?: number | null; // Original age before cascade
  time_ms: number;
  record_date?: string | null;
}

export interface ClubPerformanceRanked {
  id: number;
  athlete_name: string;
  swimmer_iuf?: string | null;
  sex: string;
  pool_m: number;
  event_code: string;
  event_label?: string | null;
  age: number;
  actual_age?: number | null;
  time_ms: number;
  record_date?: string | null;
  source?: string | null;
}

export interface ClubRecordSwimmer {
  id: number | null;
  source_type: "user" | "manual";
  user_id?: number | null;
  display_name: string;
  iuf?: string | null;
  sex?: "M" | "F" | null;
  birthdate?: string | null;
  is_active: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TimesheetShift {
  id: number;
  coach_id: number;
  coach_name?: string | null;
  shift_date: string;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  is_travel: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  group_names?: string[] | null;
}

export interface TimesheetLocation {
  id: number;
  name: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TimesheetGroupLabel {
  id: number;
  name: string;
  created_at?: string | null;
}

export interface FeatureCapability {
  available: boolean;
  missingTables?: string[];
}

export interface ApiCapabilities {
  version?: string | null;
  timesheet: FeatureCapability;
  messaging: FeatureCapability;
  mode: "supabase" | "local";
}

export interface ApiErrorInfo {
  message: string;
  code?: string;
  status?: number;
}

export interface SyncSessionInput {
  athlete_name: string;
  date: string;
  slot: string;
  effort: number;
  feeling: number;
  rpe?: number | null;
  performance?: number | null;
  engagement?: number | null;
  fatigue?: number | null;
  distance: number;
  duration: number;
  comments: string;
  stroke_distances?: StrokeDistances | null;
}

export interface StrengthRunPayload {
  sessionId: number;
  startedAt: string;
  athleteId?: number | string | null;
  athleteName?: string | null;
  cycle?: StrengthCycleType | null;
}

export interface StrengthSetPayload {
  runId: number;
  exerciseId: number;
  setIndex: number;
  reps: number;
  weight: number;
  notes?: string | null;
  difficulty?: number | null;
  athleteId?: number | string | null;
  athleteName?: string | null;
}

export interface SwimmerPerformance {
  id: number;
  user_id?: number | null;
  swimmer_iuf: string;
  event_code: string;
  pool_length: number;
  time_seconds: number;
  time_display?: string | null;
  competition_name?: string | null;
  competition_date?: string | null;
  competition_location?: string | null;
  ffn_points?: number | null;
  source: string;
  imported_at?: string | null;
}

export interface SplitTimeEntry {
  rep: number;
  time_seconds: number;
}

export interface StrokeCountEntry {
  rep: number;
  count: number;
}

export const EQUIPMENT_OPTIONS = [
  { value: "aucun", label: "Sans équipement" },
  { value: "palmes", label: "Palmes" },
  { value: "plaquettes", label: "Plaquettes" },
  { value: "pull-buoy", label: "Pull-buoy" },
  { value: "tuba", label: "Tuba frontal" },
  { value: "elastique", label: "Élastique" },
  { value: "combinaison", label: "Combinaison" },
] as const;

export interface SwimExerciseLog {
  id: string;
  session_id: number | null;
  user_id: string;
  exercise_label: string;
  source_item_id: number | null;
  split_times: SplitTimeEntry[];
  tempo: number | null;
  stroke_count: StrokeCountEntry[];
  notes: string | null;
  event_code: string | null;
  pool_length: number | null;
  equipment: string[];
  created_at: string;
  updated_at: string;
}

export interface SwimExerciseLogInput {
  exercise_label: string;
  source_item_id?: number | null;
  split_times?: SplitTimeEntry[];
  tempo?: number | null;
  stroke_count?: StrokeCountEntry[];
  notes?: string | null;
  event_code?: string | null;
  pool_length?: number | null;
  equipment?: string[];
}

export interface CoachAssignment {
  id: number;
  title: string;
  type: "swim" | "strength";
  scheduledDate: string;        // ISO date "YYYY-MM-DD"
  scheduledSlot: "morning" | "evening" | null;
  targetLabel: string;           // Group name or swimmer name
  targetType: "group" | "user";
  status: string;
}

export interface TemporaryGroupSummary {
  id: number;
  name: string;
  is_active: boolean;
  parent_group_id: number | null;
  member_count: number;
  subgroup_count: number;
  created_at: string;
  created_by: number;
}

export interface TemporaryGroupMember {
  user_id: number;
  display_name: string;
  permanent_group_label: string | null;
}

export interface TemporaryGroupDetail {
  id: number;
  name: string;
  is_active: boolean;
  members: TemporaryGroupMember[];
  subgroups: Array<{
    id: number;
    name: string;
    members: Array<{ user_id: number; display_name: string }>;
  }>;
}

export interface Competition {
  id: string;
  name: string;
  date: string;
  end_date?: string | null;
  location?: string | null;
  description?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

export interface CompetitionInput {
  name: string;
  date: string;
  end_date?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface CompetitionAssignment {
  id: number;
  competition_id: string;
  athlete_id: number;
  assigned_at?: string | null;
}

export interface Objective {
  id: string;
  athlete_id: string;
  competition_id?: string | null;
  event_code?: string | null;
  pool_length?: number | null;
  target_time_seconds?: number | null;
  text?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  competition_name?: string | null;
  competition_date?: string | null;
  athlete_name?: string | null;
}

export interface ObjectiveInput {
  athlete_id: string;
  competition_id?: string | null;
  event_code?: string | null;
  pool_length?: number | null;
  target_time_seconds?: number | null;
  text?: string | null;
}

export interface PlannedAbsence {
  id: number;
  user_id: number;
  date: string;
  reason?: string | null;
  created_at?: string | null;
}

export interface TrainingCycle {
  id: string;
  group_id?: number | null;
  athlete_id?: number | null;
  start_competition_id?: string | null;
  end_competition_id: string;
  start_date?: string | null;
  name: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  start_competition_name?: string | null;
  start_competition_date?: string | null;
  end_competition_name?: string | null;
  end_competition_date?: string | null;
}

export interface TrainingCycleInput {
  group_id?: number | null;
  athlete_id?: number | null;
  start_competition_id?: string | null;
  end_competition_id: string;
  start_date?: string | null;
  name: string;
  notes?: string | null;
}

export interface TrainingWeek {
  id: string;
  cycle_id: string;
  week_start: string;
  week_type?: string | null;
  notes?: string | null;
}

export interface TrainingWeekInput {
  cycle_id: string;
  week_start: string;
  week_type?: string | null;
  notes?: string | null;
}

export type InterviewStatus = 'draft_athlete' | 'draft_coach' | 'sent' | 'signed';

export interface Interview {
  id: string;
  athlete_id: number;
  status: InterviewStatus;
  date: string;
  athlete_successes?: string | null;
  athlete_difficulties?: string | null;
  athlete_goals?: string | null;
  athlete_commitments?: string | null;
  coach_review?: string | null;
  coach_objectives?: string | null;
  coach_actions?: string | null;
  coach_comment_successes?: string | null;
  coach_comment_difficulties?: string | null;
  coach_comment_goals?: string | null;
  athlete_commitment_review?: string | null;
  current_cycle_id?: string | null;
  submitted_at?: string | null;
  sent_at?: string | null;
  signed_at?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

export interface InterviewCreateInput {
  athlete_id: number;
  date?: string;
  current_cycle_id?: string | null;
}

export interface InterviewAthleteInput {
  athlete_successes?: string | null;
  athlete_difficulties?: string | null;
  athlete_goals?: string | null;
  athlete_commitments?: string | null;
  athlete_commitment_review?: string | null;
}

export interface InterviewCoachInput {
  coach_review?: string | null;
  coach_objectives?: string | null;
  coach_actions?: string | null;
  coach_comment_successes?: string | null;
  coach_comment_difficulties?: string | null;
  coach_comment_goals?: string | null;
}

export interface NeurotypScores {
  "1A": number;
  "1B": number;
  "2A": number;
  "2B": number;
  "3": number;
}

export type NeurotypCode = "1A" | "1B" | "2A" | "2B" | "3";

export interface NeurotypResult {
  dominant: NeurotypCode;
  scores: NeurotypScores;
  takenAt: string;
}

// ── Training Slots ──────────────────────────────────────────

export interface TrainingSlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  lane_count: number | null;
  /** If set, this is a one-off slot for this specific date (not recurring) */
  scheduled_date: string | null;
  assignments: TrainingSlotAssignment[];
  coaches: TrainingSlotCoach[];
}

export interface TrainingSlotAssignment {
  id: string;
  slot_id: string;
  group_id: number;
  group_name: string;
}

export interface TrainingSlotCoach {
  id: string;
  slot_id: string;
  coach_id: number;
  coach_name: string;
}

export interface TrainingSlotOverride {
  id: string;
  slot_id: string;
  override_date: string;
  status: 'cancelled' | 'modified';
  new_start_time: string | null;
  new_end_time: string | null;
  new_location: string | null;
  reason: string | null;
  created_by: number | null;
  created_at: string;
}

export interface TrainingSlotInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  lane_count: number | null;
  group_ids: number[];
  coach_ids: number[];
  /** If set, creates a one-off slot for this specific date */
  scheduled_date?: string | null;
}

export interface TrainingSlotOverrideInput {
  slot_id: string;
  override_date: string;
  status: 'cancelled' | 'modified';
  new_start_time?: string | null;
  new_end_time?: string | null;
  new_location?: string | null;
  reason?: string | null;
}

export interface SwimmerTrainingSlot {
  id: string;
  user_id: number;
  source_assignment_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
}

export interface SwimmerTrainingSlotInput {
  user_id: number;
  source_assignment_id?: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
}

// ── Competition Prep (Races, Routines, Checklists) ─────────

export interface CompetitionRace {
  id: string;
  competition_id: string;
  athlete_id: number;
  event_code: string;
  race_day: string;
  start_time?: string | null;
  notes?: string | null;
  sort_order: number;
  race_type: string;
  final_letter?: string | null;
  lane?: number | null;
  created_at?: string | null;
}

export interface CompetitionRaceInput {
  competition_id: string;
  event_code: string;
  race_day: string;
  start_time?: string | null;
  notes?: string | null;
  sort_order?: number;
  race_type?: string;
  final_letter?: string | null;
  lane?: number | null;
}

export interface RoutineTemplate {
  id: string;
  athlete_id: number;
  name: string;
  created_at?: string | null;
  steps?: RoutineStep[];
}

export interface RoutineStep {
  id: string;
  routine_id: string;
  offset_minutes: number;
  label: string;
  sort_order: number;
  created_at?: string | null;
}

export interface RoutineStepInput {
  offset_minutes: number;
  label: string;
  sort_order?: number;
}

export interface RaceRoutine {
  id: string;
  race_id: string;
  routine_id: string;
}

export interface ChecklistTemplate {
  id: string;
  athlete_id: number;
  name: string;
  created_at?: string | null;
  items?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  label: string;
  sort_order: number;
  created_at?: string | null;
}

export interface ChecklistItemInput {
  label: string;
  sort_order?: number;
}

export interface CompetitionChecklist {
  id: string;
  competition_id: string;
  athlete_id: number;
  checklist_template_id: string;
}

export interface CompetitionChecklistCheck {
  id: string;
  competition_checklist_id: string;
  checklist_item_id: string;
  checked: boolean;
  checked_at?: string | null;
}

// ── Achievements / Badges ─────────────────────────────────

export interface Achievement {
  id: string;
  user_id: number;
  type: string;
  key: string;
  unlocked_at: string;
  metadata: Record<string, unknown>;
}

// ── Challenges ────────────────────────────────────────────

export interface Challenge {
  id: string;
  coach_id: number;
  group_id: number | null;
  title: string;
  type: 'attendance' | 'wellness' | 'custom';
  target: number;
  current_value: number;
  start_date: string;
  end_date: string;
  created_at: string;
}

// ── Wellness Checks ────────────────────────────────────────

export interface WellnessCheck {
  id: string;
  user_id: number;
  date: string;
  sleep_quality: number;
  sleep_hours: number;
  fatigue: number;
  soreness: number;
  mood: number;
  stress: number;
  readiness_score: number;
  notes?: string | null;
  created_at: string;
}

export interface PainReport {
  id: string;
  user_id: number;
  date: string;
  body_zone: string;
  intensity: number; // 1-3
  created_at: string;
}

// ── Resolved Slot Assignment (swimmer daily view) ──

export interface ResolvedSlotAssignment {
  /** The swimmer's personal slot ID (swimmer_training_slots.id) */
  swimmerSlotId: string;
  /** Display time range, e.g. "17:00-18:00" */
  slotTime: string;
  /** Location of the slot */
  slotLocation: string;
  /** The training_slot_id this personal slot was initialized from (via source_assignment_id) */
  sourceTrainingSlotId: string | null;
  /** The resolved session assignment (or null if no session assigned) */
  assignment: Assignment | null;
  /** The assignment database ID */
  assignmentId: number | null;
  /** How the session was resolved */
  source: 'individual' | 'subgroup' | 'group' | 'none';
  /** Other sessions available on this slot (for sub-group switching) */
  alternatives: Array<{ assignmentId: number; title: string; km: number | null; subgroupName?: string }>;
}

// ── Swim Planning Slots ──

export interface SwimPlanningSlot {
  id: string;
  group_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
  created_at?: string;
}

export interface SwimPlanningSlotInput {
  group_id: number;
  week_start: string;
  day_of_week: number;
  time_slot: "morning" | "evening";
  filiere: string;
  session_id?: string | null;
}

// ── Swim Filières ──

export interface SwimFiliere {
  id: string;
  name: string;
  short_name: string;
  color: string;
  description?: string | null;
  examples?: string | null;
  sort_order: number;
}

export interface SwimFiliereInput {
  id: string;
  description?: string | null;
  examples?: string | null;
}

// ── Chrono Records ──────────────────────────────────────────────────

export interface ChronoRecordSplit {
  distanceM: number;
  cumulativeMs: number;
  lapMs: number;
}

export interface ChronoRecordSwimmer {
  athleteId: number;
  displayName: string;
  lane: number;
  wave: number;
  splitsByRep: ChronoRecordSplit[][];
}

export interface ChronoRecordConfig {
  totalDistanceM: number;
  splitDistanceM: number;
  seriesCount: number;
  laneCount: number;
}

export interface ChronoRecord {
  id: string;
  coach_id: string;
  status: "draft" | "sent";
  label: string | null;
  config: ChronoRecordConfig;
  swimmers: ChronoRecordSwimmer[];
  created_at: string;
  updated_at: string;
}

export interface ChronoRecordInput {
  status: "draft" | "sent";
  label: string;
  config: ChronoRecordConfig;
  swimmers: ChronoRecordSwimmer[];
}
