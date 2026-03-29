// =============================================================================
// Shared types used across the application to replace `any` annotations.
// =============================================================================

// ---------------------------------------------------------------------------
// Raw / flexible payload coming from JSONB columns
// ---------------------------------------------------------------------------
export type RawSwimPayload = Record<string, unknown>;

/** Typed fields commonly found in raw_payload for swim session items */
export interface SwimPayloadFields {
  block_title?: string | null;
  section?: string | null;
  block_order?: number | null;
  block_equipment?: string[] | string | null;
  equipment?: string[] | string | null;
  block_modalities?: string | null;
  modalities?: string | null;
  block_description?: string | null;
  block_repetitions?: number | null;
  exercise_repetitions?: number | null;
  exercise_label?: string | null;
  exercise_modalities?: string | null;
  exercise_equipment?: string[] | string | null;
  exercise_intensity?: string | null;
  exercise_stroke?: string | null;
  exercise_stroke_type?: string | null;
  exercise_rest?: number | null;
  exercise_rest_type?: "departure" | "rest" | null;
  instruction?: string | null;
  rest?: string | null;
  stroke?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Database row shapes (before mapping to frontend interfaces)
// ---------------------------------------------------------------------------

/** Row from dim_sessions or local-storage equivalent */
export interface RawDbSession {
  id?: number | null;
  athlete_id?: number | null;
  athlete_name?: string | null;
  session_date?: string | null;
  date?: string | null;
  time_slot?: string | null;
  slot?: string | null;
  distance?: number | null;
  duration?: number | null;
  rpe?: number | null;
  effort?: number | null;
  performance?: number | null;
  feeling?: number | null;
  engagement?: number | null;
  fatigue?: number | null;
  comments?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Row from dim_exercices or local-storage (may carry frontend aliases) */
export interface RawDbExercise {
  id: number;
  numero_exercice?: number | null;
  numero?: number | null;
  nom_exercice?: string | null;
  name?: string | null;
  description?: string | null;
  illustration_gif?: string | null;
  exercise_type?: string | null;
  type?: string | null;
  is_warmup?: boolean | null;
  warmup_reps?: number | null;
  warmup_duration?: number | null;
  nb_series_endurance?: number | null;
  nb_reps_endurance?: number | null;
  pourcentage_charge_1rm_endurance?: number | null;
  recup_series_endurance?: number | null;
  recup_exercices_endurance?: number | null;
  nb_series_hypertrophie?: number | null;
  nb_reps_hypertrophie?: number | null;
  pourcentage_charge_1rm_hypertrophie?: number | null;
  recup_series_hypertrophie?: number | null;
  recup_exercices_hypertrophie?: number | null;
  nb_series_force?: number | null;
  nb_reps_force?: number | null;
  pourcentage_charge_1rm_force?: number | null;
  recup_series_force?: number | null;
  recup_exercices_force?: number | null;
  // Frontend-convention aliases
  Nb_series_endurance?: number | null;
  Nb_reps_endurance?: number | null;
  pct_1rm_endurance?: number | null;
  recup_endurance?: number | null;
  Nb_series_hypertrophie?: number | null;
  Nb_reps_hypertrophie?: number | null;
  pct_1rm_hypertrophie?: number | null;
  recup_hypertrophie?: number | null;
  Nb_series_force?: number | null;
  Nb_reps_force?: number | null;
  pct_1rm_force?: number | null;
  recup_force?: number | null;
}

// ---------------------------------------------------------------------------
// Strength items – raw shape coming from DB or local storage
// ---------------------------------------------------------------------------
export interface RawStrengthItem {
  exercise_id: number;
  ordre?: number | null;
  order_index?: number | null;
  sets?: number | null;
  reps?: number | null;
  rest_series_s?: number | null;
  rest_seconds?: number | null;
  pct_1rm?: number | null;
  percent_1rm?: number | null;
  cycle_type?: string | null;
  notes?: string | null;
  exercise_name?: string | null;
  nom_exercice?: string | null;
  category?: string | null;
  exercise_type?: string | null;
  dim_exercices?: { nom_exercice?: string; exercise_type?: string } | null;
  block?: string | null;
  muscle_groups?: string | null;
  muscles?: string | null;
  muscleGroups?: string | null;
}

// ---------------------------------------------------------------------------
// Strength session create/update input
// ---------------------------------------------------------------------------
export interface StrengthSessionInput {
  id?: number;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  cycle?: string | null;
  cycle_type?: string | null;
  items?: RawStrengthItem[];
}

// ---------------------------------------------------------------------------
// Set log entry (used in WorkoutRunner, api, Strength page)
// ---------------------------------------------------------------------------
export interface SetLogEntry {
  id?: number;
  run_id?: number;
  exercise_id: number;
  set_index?: number | null;
  set_number?: number | null;
  setIndex?: number | null;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  notes?: string | null;
  pct_1rm_suggested?: number | null;
  rest_seconds?: number | null;
  difficulty?: number | null;
  completed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Strength run – local-storage or Supabase join shape
// ---------------------------------------------------------------------------
export interface LocalStrengthRun {
  id: number;
  assignment_id?: number | null;
  athlete_id?: number | string | null;
  athlete_name?: string | null;
  session_id?: number | null;
  cycle_type?: string | null;
  status?: string;
  progress_pct?: number;
  started_at?: string | null;
  completed_at?: string | null;
  date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  fatigue?: number | null;
  feeling?: number | null;
  rpe?: number | null;
  duration?: number | null;
  comments?: string | null;
  logs?: SetLogEntry[];
  raw_payload?: Record<string, unknown> | null;
  // Supabase join column
  strength_set_logs?: SetLogEntry[];
}

// ---------------------------------------------------------------------------
// Save / update strength run inputs
// ---------------------------------------------------------------------------
export interface SaveStrengthRunInput {
  run_id?: number | null;
  assignment_id?: number | null;
  athlete_id?: number | string | null;
  athlete_name?: string | null;
  progress_pct?: number;
  started_at?: string | null;
  date?: string | null;
  logs?: SetLogEntry[];
}

export interface UpdateStrengthRunInput {
  run_id: number;
  progress_pct?: number;
  status?: "in_progress" | "completed" | "abandoned";
  fatigue?: number;
  comments?: string;
  assignment_id?: number;
  session_id?: number;
  athlete_id?: number | string;
  date?: string;
  difficulty?: number;
  feeling?: number;
  duration?: number;
  logs?: SetLogEntry[];
}

// ---------------------------------------------------------------------------
// Swim session create/update input
// ---------------------------------------------------------------------------
export interface SwimSessionInput {
  id?: number;
  name: string;
  description?: string | null;
  estimated_duration?: number | null;
  created_by?: number | null;
  folder?: string | null;
  items?: SwimSessionItemInput[];
}

export interface SwimSessionItemInput {
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

// ---------------------------------------------------------------------------
// Local-storage shapes
// ---------------------------------------------------------------------------
export interface LocalAssignment {
  id: number;
  session_id: number;
  session_type: "swim" | "strength";
  assignment_type?: "swim" | "strength";
  swim_catalog_id?: number | null;
  strength_session_id?: number | null;
  title?: string;
  description?: string;
  assigned_date?: string;
  scheduled_date?: string | null;
  scheduled_slot?: string | null;
  status: string;
  target_athlete?: string;
  target_user_id?: number | null;
  target_group_id?: number | null;
  items?: unknown[];
  cycle?: string;
  updated_at?: string;
  created_at?: string | null;
}

export interface LocalNotification {
  id: number;
  sender?: string;
  sender_id?: number | null;
  sender_email?: string | null;
  target_athlete?: string;
  target_user_id?: number | null;
  target_group_id?: number | null;
  title: string;
  message: string;
  type: string;
  read: boolean;
  date: string;
  created_at?: string;
  related_id?: number;
}

export interface OneRmEntry {
  id?: number | null;
  athlete_id?: number | string | null;
  athlete_name?: string | null;
  exercise_id: number;
  weight: number;
  one_rm?: number;
  recorded_at?: string | null;
  date?: string | null;
  notes?: string | null;
}

export interface LocalSwimRecord {
  id: number;
  athlete_id?: number | null;
  athlete_name?: string | null;
  event_name: string;
  pool_length?: number | null;
  time_seconds?: number | null;
  record_date?: string | null;
  notes?: string | null;
  ffn_points?: number | null;
  record_type?: string | null;
}

// ---------------------------------------------------------------------------
// Import club records result
// ---------------------------------------------------------------------------
export interface ImportClubRecordsResult {
  inserted?: number;
  updated?: number;
  errors?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Hall of Fame
// ---------------------------------------------------------------------------
export interface HallOfFameSwimDistance {
  athlete_name: string;
  total_distance: number;
  avatar_url?: string | null;
}

export interface HallOfFameSwimPerformance {
  athlete_name: string;
  avg_effort: number;
  avatar_url?: string | null;
}

export interface HallOfFameSwimEngagement {
  athlete_name: string;
  avg_engagement: number;
  avatar_url?: string | null;
}

export interface HallOfFameStrength {
  athlete_name: string;
  total_volume: number;
  total_reps: number;
  total_sets: number;
  max_weight: number;
  avatar_url?: string | null;
}

export interface HallOfFameData {
  distance: HallOfFameSwimDistance[];
  performance: HallOfFameSwimPerformance[];
  engagement: HallOfFameSwimEngagement[];
  strength: HallOfFameStrength[];
}

// ---------------------------------------------------------------------------
// Raw Supabase join shapes
// ---------------------------------------------------------------------------
export interface RawSupabaseStrengthSession {
  id: number;
  name?: string | null;
  description?: string | null;
  created_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  strength_session_items?: RawStrengthItem[];
}

export interface RawSwimCatalog {
  id: number;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  created_by?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  folder?: string | null;
  is_archived?: boolean;
  swim_session_items?: RawSwimCatalogItem[];
  items?: RawSwimCatalogItem[];
}

export interface RawSwimCatalogItem {
  id?: number | null;
  catalog_id?: number | null;
  ordre?: number | null;
  label?: string | null;
  section?: string | null;
  distance?: number | null;
  duration?: number | null;
  intensity?: string | null;
  notes?: string | null;
  instruction?: string | null;
  rest?: string | null;
  stroke?: string | null;
  raw_payload?: unknown;
}

export interface RawNotificationTarget {
  id: number;
  target_user_id?: number | null;
  target_group_id?: number | null;
  read_at?: string | null;
  notifications?: {
    id?: number;
    title?: string | null;
    body?: string | null;
    type?: string | null;
    created_by?: number | null;
    created_at?: string | null;
  };
}

export interface RawUserRow {
  id: number;
  display_name: string;
  role?: string;
  email?: string | null;
  is_active?: boolean;
}

export interface RawGroupRow {
  id: number;
  name?: string | null;
  description?: string | null;
}

export interface RawGroupMemberRow {
  user_id: number;
  group_id: number;
  users?: { display_name?: string; role?: string } | null;
}

export interface RawClubRecordSwimmerRow {
  id: number;
  source_type: "user" | "manual";
  user_id?: number | null;
  display_name: string;
  iuf?: string | null;
  sex?: "M" | "F" | null;
  birthdate?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

// ---------------------------------------------------------------------------
// Workout Runner callback data
// ---------------------------------------------------------------------------
export interface SetInputValues {
  reps?: number;
  weight?: number;
  difficulty?: number | null;
}

export interface WorkoutFinishData {
  fatigue: number;
  difficulty?: number;
  feeling?: number;
  duration?: number;
  logs: SetLogEntry[];
  comments?: string;
}

// ---------------------------------------------------------------------------
// Supabase RPC / hall-of-fame raw row
// ---------------------------------------------------------------------------
export interface RawHallOfFameRow {
  athlete_name: string;
  total_distance?: number | null;
  avg_performance?: number | null;
  avg_engagement?: number | null;
}

// ---------------------------------------------------------------------------
// Dashboard-specific types
// ---------------------------------------------------------------------------
export interface DashboardAssignment {
  id: number;
  session_id: number;
  session_type: "swim" | "strength";
  assigned_date?: string;
  scheduled_date?: string;
  created_at?: string;
  status?: string;
  title?: string;
  description?: string;
  items?: unknown[];
  cycle?: string;
  assigned_slot?: string | null;
  target_user_id?: number | null;
}

// ---------------------------------------------------------------------------
// Profile page
// ---------------------------------------------------------------------------
export interface ProfileData {
  id?: number | null;
  display_name?: string | null;
  email?: string | null;
  birthdate?: string | null;
  group_id?: number | null;
  group_label?: string | null;
  objectives?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  ffn_iuf?: string | null;
}

// ---------------------------------------------------------------------------
// Records page – swim record with pool_length for filtering
// ---------------------------------------------------------------------------
export interface SwimRecordWithPool {
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
  // Fallback field names (camelCase / legacy payloads)
  poolLength?: number | null;
  poolLen?: number | null;
  pool?: number | string | null;
  ffnPoints?: number | null;
  pts?: number | null;
  meet?: string | null;
  meet_name?: string | null;
  meetName?: string | null;
  competition?: string | null;
}

// ---------------------------------------------------------------------------
// Notification thread (used in Notifications page)
// ---------------------------------------------------------------------------
export interface NotificationThread {
  threadId: string;
  counterparty_id: number | null;
  counterparty_name: string | null;
  counterparty_role: string | null;
  lastMessage: string;
  lastDate: string;
  unreadCount: number;
  messages: import("./api").Notification[];
}
