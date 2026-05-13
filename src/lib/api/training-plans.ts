/**
 * API Training Plans — CRUD for training_plans, training_plan_sessions,
 * training_plan_applications. See §275.1 migration `00162_training_plans.sql`.
 *
 * Model summary:
 * - A `training_plan` is a generic, reusable template (owner-scoped, optional
 *   draft state) of `num_weeks` weeks across a single discipline.
 * - `training_plan_sessions` populate the grid (relative_week, day_of_week)
 *   with a `session_template_id` (or just notes for rest days).
 * - `training_plan_applications` materialize the plan against a target
 *   (athlete OR group) starting from a Monday (`start_date`).
 */
import { supabase, canUseSupabase, assertSupabase } from "./client";
import type {
  TrainingPlan,
  TrainingPlanInput,
  TrainingPlanPatch,
  TrainingPlanSession,
  TrainingPlanSessionInput,
  TrainingPlanApplication,
  TrainingPlanApplicationInput,
  TrainingPlanDiscipline,
} from "./types";

// ────────────────────────────────────────────────────────────────────
// training_plans
// ────────────────────────────────────────────────────────────────────

export interface GetTrainingPlansOptions {
  /** Restrict to plans owned by this user (omit to use RLS visibility). */
  ownerId?: number;
  /** Filter by discipline. */
  discipline?: TrainingPlanDiscipline;
  /** Set to `false` to exclude drafts. Default: include all the caller can see. */
  includeDrafts?: boolean;
}

export async function getTrainingPlans(
  opts: GetTrainingPlansOptions = {},
): Promise<TrainingPlan[]> {
  if (!canUseSupabase()) return [];
  let query = supabase
    .from("training_plans")
    .select("*")
    .order("updated_at", { ascending: false });
  if (opts.ownerId != null) query = query.eq("owner_id", opts.ownerId);
  if (opts.discipline) query = query.eq("discipline", opts.discipline);
  if (opts.includeDrafts === false) query = query.eq("is_draft", false);
  const data = assertSupabase(await query);
  return (data ?? []) as TrainingPlan[];
}

export async function getTrainingPlan(planId: number): Promise<TrainingPlan | null> {
  if (!canUseSupabase()) return null;
  const { data, error } = await supabase
    .from("training_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as TrainingPlan | null;
}

export async function createTrainingPlan(
  input: TrainingPlanInput,
  ownerId: number,
): Promise<TrainingPlan> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("training_plans")
      .insert({
        name: input.name,
        description: input.description ?? null,
        discipline: input.discipline ?? "strength",
        num_weeks: input.num_weeks,
        is_draft: input.is_draft ?? true,
        owner_id: ownerId,
      })
      .select()
      .single(),
  );
  return data as TrainingPlan;
}

export async function updateTrainingPlan(
  planId: number,
  patch: TrainingPlanPatch,
): Promise<TrainingPlan> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("training_plans")
      .update(patch)
      .eq("id", planId)
      .select()
      .single(),
  );
  return data as TrainingPlan;
}

export async function deleteTrainingPlan(planId: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  // Use RETURNING to surface RLS no-ops (§113 pattern).
  const data = assertSupabase(
    await supabase
      .from("training_plans")
      .delete()
      .eq("id", planId)
      .select("id"),
  );
  if (!data || (data as { id: number }[]).length === 0) {
    throw new Error("Plan introuvable ou suppression refusée");
  }
}

// ────────────────────────────────────────────────────────────────────
// training_plan_sessions (grid cells)
// ────────────────────────────────────────────────────────────────────

export async function getTrainingPlanSessions(
  planId: number,
): Promise<TrainingPlanSession[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("training_plan_sessions")
      .select("*")
      .eq("plan_id", planId)
      .order("relative_week")
      .order("day_of_week"),
  );
  return (data ?? []) as TrainingPlanSession[];
}

export async function upsertTrainingPlanSession(
  input: TrainingPlanSessionInput,
): Promise<TrainingPlanSession> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("training_plan_sessions")
      .upsert(
        {
          plan_id: input.plan_id,
          relative_week: input.relative_week,
          day_of_week: input.day_of_week,
          session_template_id: input.session_template_id ?? null,
          notes: input.notes ?? null,
        },
        { onConflict: "plan_id,relative_week,day_of_week" },
      )
      .select()
      .single(),
  );
  return data as TrainingPlanSession;
}

export async function deleteTrainingPlanSession(id: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("training_plan_sessions")
      .delete()
      .eq("id", id)
      .select("id"),
  );
  if (!data || (data as { id: number }[]).length === 0) {
    throw new Error("Séance introuvable ou suppression refusée");
  }
}

// ────────────────────────────────────────────────────────────────────
// training_plan_applications
// ────────────────────────────────────────────────────────────────────

export interface GetTrainingPlanApplicationsOptions {
  planId?: number;
  targetUserId?: number;
  targetGroupId?: number;
  appliedBy?: number;
}

export async function getTrainingPlanApplications(
  opts: GetTrainingPlanApplicationsOptions = {},
): Promise<TrainingPlanApplication[]> {
  if (!canUseSupabase()) return [];
  let query = supabase
    .from("training_plan_applications")
    .select("*")
    .order("start_date", { ascending: false });
  if (opts.planId != null) query = query.eq("plan_id", opts.planId);
  if (opts.targetUserId != null) query = query.eq("target_user_id", opts.targetUserId);
  if (opts.targetGroupId != null) query = query.eq("target_group_id", opts.targetGroupId);
  if (opts.appliedBy != null) query = query.eq("applied_by", opts.appliedBy);
  const data = assertSupabase(await query);
  return (data ?? []) as TrainingPlanApplication[];
}

/**
 * Active applications targeting a given user on a reference date — direct
 * (target_user_id = userId) OR via group membership. "Active" means
 * `start_date ≤ date` and the week derived from `(date - start_date)` is
 * still within the plan's `num_weeks` window (or `end_date` if set).
 *
 * The result joins the parent plan to expose `num_weeks` and `discipline`,
 * which callers (e.g. the planning timeline) need to compute relative_week
 * and filter by discipline.
 */
export interface ActiveTrainingPlanApplication extends TrainingPlanApplication {
  plan_num_weeks: number;
  plan_discipline: TrainingPlanDiscipline;
  plan_name: string;
}

/**
 * All applications targeting a given user (direct OR via group memberships),
 * enriched with parent-plan metadata. NO date filter — caller can compute
 * `relative_week` per visible date and decide which application applies.
 *
 * Use this for the planning-timeline derivation (§275.6) where we render
 * a sliding window of multiple weeks and need to map each one to a
 * potentially different application/relative_week.
 */
export async function getTrainingPlanApplicationsForUser(opts: {
  userId: number;
  discipline?: TrainingPlanDiscipline;
}): Promise<ActiveTrainingPlanApplication[]> {
  if (!canUseSupabase()) return [];

  const memberRes = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", opts.userId);
  if (memberRes.error) throw new Error(memberRes.error.message);
  const groupIds = (memberRes.data ?? []).map((m) => m.group_id as number);

  const userClause = `target_user_id.eq.${opts.userId}`;
  const groupClause =
    groupIds.length > 0 ? `,target_group_id.in.(${groupIds.join(",")})` : "";
  const orFilter = `${userClause}${groupClause}`;

  let query = supabase
    .from("training_plan_applications")
    .select("*, training_plans!inner(id, num_weeks, discipline, name)")
    .or(orFilter)
    .order("start_date", { ascending: false });

  if (opts.discipline) {
    query = query.eq("training_plans.discipline", opts.discipline);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<TrainingPlanApplication & {
    training_plans: { id: number; num_weeks: number; discipline: TrainingPlanDiscipline; name: string };
  }>).map((r) => ({
    id: r.id,
    plan_id: r.plan_id,
    target_user_id: r.target_user_id,
    target_group_id: r.target_group_id,
    start_date: r.start_date,
    end_date: r.end_date,
    applied_by: r.applied_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    plan_num_weeks: r.training_plans.num_weeks,
    plan_discipline: r.training_plans.discipline,
    plan_name: r.training_plans.name,
  }));
}

/**
 * Fetch all training_plan_sessions for a set of plan ids in one round-trip.
 * Used by the timeline derivation to look up sessions across multiple
 * applications without N queries.
 */
export async function getTrainingPlanSessionsForPlans(
  planIds: number[],
): Promise<TrainingPlanSession[]> {
  if (!canUseSupabase() || planIds.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("training_plan_sessions")
      .select("*")
      .in("plan_id", planIds)
      .order("plan_id")
      .order("relative_week")
      .order("day_of_week"),
  );
  return (data ?? []) as TrainingPlanSession[];
}

export async function getActiveTrainingPlanApplicationsForUser(opts: {
  userId: number;
  date: string; // ISO YYYY-MM-DD
  discipline?: TrainingPlanDiscipline;
}): Promise<ActiveTrainingPlanApplication[]> {
  if (!canUseSupabase()) return [];

  // Fetch the user's group memberships once.
  const memberRes = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", opts.userId);
  if (memberRes.error) throw new Error(memberRes.error.message);
  const groupIds = (memberRes.data ?? []).map((m) => m.group_id as number);

  // Build OR filter on target_user_id / target_group_id.
  const userClause = `target_user_id.eq.${opts.userId}`;
  const groupClause =
    groupIds.length > 0 ? `,target_group_id.in.(${groupIds.join(",")})` : "";
  const orFilter = `${userClause}${groupClause}`;

  let query = supabase
    .from("training_plan_applications")
    .select("*, training_plans!inner(id, num_weeks, discipline, name)")
    .or(orFilter)
    .lte("start_date", opts.date);

  if (opts.discipline) {
    query = query.eq("training_plans.discipline", opts.discipline);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<TrainingPlanApplication & {
    training_plans: { id: number; num_weeks: number; discipline: TrainingPlanDiscipline; name: string };
  }>;

  // Filter to applications still active on `opts.date`:
  // - if end_date is set: opts.date <= end_date
  // - else: opts.date - start_date < num_weeks * 7 days
  const refDate = new Date(opts.date + "T00:00:00");
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const active = rows.filter((r) => {
    const start = new Date(r.start_date + "T00:00:00");
    const daysSinceStart = Math.floor((refDate.getTime() - start.getTime()) / MS_PER_DAY);
    if (daysSinceStart < 0) return false;
    if (r.end_date) {
      return r.end_date >= opts.date;
    }
    return daysSinceStart < r.training_plans.num_weeks * 7;
  });

  return active.map((r) => ({
    id: r.id,
    plan_id: r.plan_id,
    target_user_id: r.target_user_id,
    target_group_id: r.target_group_id,
    start_date: r.start_date,
    end_date: r.end_date,
    applied_by: r.applied_by,
    created_at: r.created_at,
    updated_at: r.updated_at,
    plan_num_weeks: r.training_plans.num_weeks,
    plan_discipline: r.training_plans.discipline,
    plan_name: r.training_plans.name,
  }));
}

export async function applyTrainingPlan(
  input: TrainingPlanApplicationInput,
  appliedBy: number,
): Promise<TrainingPlanApplication> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  if ((input.target_user_id == null) === (input.target_group_id == null)) {
    throw new Error(
      "Une application doit cibler soit un nageur (target_user_id) soit un groupe (target_group_id), pas les deux.",
    );
  }
  if (!isMondayIso(input.start_date)) {
    throw new Error("La date de début doit être un lundi (start_date_is_monday).");
  }
  const data = assertSupabase(
    await supabase
      .from("training_plan_applications")
      .insert({
        plan_id: input.plan_id,
        target_user_id: input.target_user_id ?? null,
        target_group_id: input.target_group_id ?? null,
        start_date: input.start_date,
        end_date: input.end_date ?? null,
        applied_by: appliedBy,
      })
      .select()
      .single(),
  );
  return data as TrainingPlanApplication;
}

export async function updateTrainingPlanApplication(
  id: number,
  patch: { end_date?: string | null; start_date?: string },
): Promise<TrainingPlanApplication> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  if (patch.start_date && !isMondayIso(patch.start_date)) {
    throw new Error("La date de début doit être un lundi.");
  }
  const data = assertSupabase(
    await supabase
      .from("training_plan_applications")
      .update(patch)
      .eq("id", id)
      .select()
      .single(),
  );
  return data as TrainingPlanApplication;
}

export async function deleteTrainingPlanApplication(id: number): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("training_plan_applications")
      .delete()
      .eq("id", id)
      .select("id"),
  );
  if (!data || (data as { id: number }[]).length === 0) {
    throw new Error("Application introuvable ou suppression refusée");
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function isMondayIso(iso: string): boolean {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  // JS getDay: 0 = Sun … 1 = Mon
  return d.getDay() === 1;
}
