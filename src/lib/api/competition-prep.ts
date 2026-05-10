/**
 * API Competition Prep — Races, Routines, Checklists for swimmer competition preparation
 */

import { supabase, canUseSupabase, assertSupabase } from "./client";
import type {
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
} from "./types";

/* ── Helpers ──────────────────────────────────────────────── */

async function getAppUserId(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  const id = session?.user?.app_metadata?.app_user_id;
  if (!id) throw new Error("User ID not found");
  return id as number;
}

/* ══════════════════════════════════════════════════════════════
   Races
   ══════════════════════════════════════════════════════════════ */

export async function getCompetitionRaces(competitionId: string): Promise<CompetitionRace[]> {
  if (!canUseSupabase()) return [];
  const athleteId = await getAppUserId();
  const data = assertSupabase(
    await supabase
      .from("competition_races")
      .select("*")
      .eq("competition_id", competitionId)
      .eq("athlete_id", athleteId)
      .order("race_day", { ascending: true })
      .order("start_time", { ascending: true })
      .order("sort_order", { ascending: true })
  );
  return (data ?? []) as CompetitionRace[];
}

export async function createCompetitionRace(input: CompetitionRaceInput): Promise<CompetitionRace> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const athleteId = await getAppUserId();
  const data = assertSupabase(
    await supabase
      .from("competition_races")
      .insert({ ...input, athlete_id: athleteId })
      .select()
      .single()
  );
  return data as CompetitionRace;
}

export async function updateCompetitionRace(
  id: string,
  input: Partial<CompetitionRaceInput>,
): Promise<CompetitionRace> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const data = assertSupabase(
    await supabase
      .from("competition_races")
      .update(input)
      .eq("id", id)
      .select()
      .single()
  );
  return data as CompetitionRace;
}

export async function deleteCompetitionRace(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("competition_races")
      .delete()
      .eq("id", id)
  );
}

/* ══════════════════════════════════════════════════════════════
   Routine Templates + Steps
   ══════════════════════════════════════════════════════════════ */

export async function getRoutineTemplates(): Promise<RoutineTemplate[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("routine_templates")
      .select("*, steps:routine_steps(*)")
      .order("created_at", { ascending: false })
  );
  // Sort steps within each template
  return ((data ?? []) as RoutineTemplate[]).map((t) => ({
    ...t,
    steps: (t.steps ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export async function createRoutineTemplate(
  name: string,
  steps: RoutineStepInput[],
): Promise<RoutineTemplate> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const athleteId = await getAppUserId();
  // Create template
  const { data: tmpl, error: tmplErr } = await supabase
    .from("routine_templates")
    .insert({ athlete_id: athleteId, name })
    .select()
    .single();
  if (tmplErr) throw new Error(tmplErr.message);
  const template = tmpl as RoutineTemplate;
  // Insert steps
  if (steps.length > 0) {
    const rows = steps.map((s, i) => ({
      routine_id: template.id,
      offset_minutes: s.offset_minutes,
      label: s.label,
      sort_order: s.sort_order ?? i,
    }));
    const { data: stepsData, error: stepsErr } = await supabase
      .from("routine_steps")
      .insert(rows)
      .select();
    if (stepsErr) throw new Error(stepsErr.message);
    template.steps = ((stepsData ?? []) as RoutineStep[]).sort((a, b) => a.sort_order - b.sort_order);
  } else {
    template.steps = [];
  }
  return template;
}

export async function deleteRoutineTemplate(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("routine_templates")
      .delete()
      .eq("id", id)
  );
}

/* ══════════════════════════════════════════════════════════════
   Race ↔ Routine linking
   ══════════════════════════════════════════════════════════════ */

export async function getRaceRoutines(competitionId: string): Promise<RaceRoutine[]> {
  if (!canUseSupabase()) return [];
  // Get race IDs for this competition first, then their routines
  const athleteId = await getAppUserId();
  const { data: races, error: racesErr } = await supabase
    .from("competition_races")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("athlete_id", athleteId);
  if (racesErr) throw new Error(racesErr.message);
  const raceIds = (races ?? []).map((r: any) => r.id);
  if (raceIds.length === 0) return [];
  const data = assertSupabase(
    await supabase
      .from("race_routines")
      .select("*")
      .in("race_id", raceIds)
  );
  return (data ?? []) as RaceRoutine[];
}

export async function setRaceRoutine(raceId: string, routineId: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  // Delete existing link for this race (UNIQUE constraint)
  await supabase.from("race_routines").delete().eq("race_id", raceId);
  assertSupabase(
    await supabase
      .from("race_routines")
      .insert({ race_id: raceId, routine_id: routineId })
  );
}

export async function removeRaceRoutine(raceId: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("race_routines")
      .delete()
      .eq("race_id", raceId)
  );
}

/* ══════════════════════════════════════════════════════════════
   Checklist Templates + Items
   ══════════════════════════════════════════════════════════════ */

export async function getChecklistTemplates(): Promise<ChecklistTemplate[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("checklist_templates")
      .select("*, items:checklist_items(*)")
      .order("created_at", { ascending: false })
  );
  return ((data ?? []) as ChecklistTemplate[]).map((t) => ({
    ...t,
    items: (t.items ?? []).sort((a, b) => a.sort_order - b.sort_order),
  }));
}

export async function createChecklistTemplate(
  name: string,
  items: ChecklistItemInput[],
): Promise<ChecklistTemplate> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const athleteId = await getAppUserId();
  const { data: tmpl, error: tmplErr } = await supabase
    .from("checklist_templates")
    .insert({ athlete_id: athleteId, name })
    .select()
    .single();
  if (tmplErr) throw new Error(tmplErr.message);
  const template = tmpl as ChecklistTemplate;
  if (items.length > 0) {
    const rows = items.map((item, i) => ({
      checklist_id: template.id,
      label: item.label,
      sort_order: item.sort_order ?? i,
    }));
    const { data: itemsData, error: itemsErr } = await supabase
      .from("checklist_items")
      .insert(rows)
      .select();
    if (itemsErr) throw new Error(itemsErr.message);
    template.items = ((itemsData ?? []) as ChecklistItem[]).sort((a, b) => a.sort_order - b.sort_order);
  } else {
    template.items = [];
  }
  return template;
}

export async function deleteChecklistTemplate(id: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("checklist_templates")
      .delete()
      .eq("id", id)
  );
}

/* ══════════════════════════════════════════════════════════════
   Competition Checklist (instance per competition)
   ══════════════════════════════════════════════════════════════ */

export async function getCompetitionChecklist(
  competitionId: string,
): Promise<{ checklist: CompetitionChecklist; checks: CompetitionChecklistCheck[] } | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(
    await supabase
      .from("competition_checklists")
      .select("*")
      .eq("competition_id", competitionId)
      .maybeSingle()
  );
  if (!data) return null;
  const checklist = data as CompetitionChecklist;
  const { data: checks, error: checksErr } = await supabase
    .from("competition_checklist_checks")
    .select("*")
    .eq("competition_checklist_id", checklist.id);
  if (checksErr) throw new Error(checksErr.message);
  return { checklist, checks: (checks ?? []) as CompetitionChecklistCheck[] };
}

export async function applyChecklistTemplate(
  competitionId: string,
  templateId: string,
): Promise<CompetitionChecklist> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  const athleteId = await getAppUserId();
  // Remove existing checklist for this competition (if any)
  await supabase
    .from("competition_checklists")
    .delete()
    .eq("competition_id", competitionId)
    .eq("athlete_id", athleteId);
  // Create new link
  const { data: cl, error: clErr } = await supabase
    .from("competition_checklists")
    .insert({ competition_id: competitionId, athlete_id: athleteId, checklist_template_id: templateId })
    .select()
    .single();
  if (clErr) throw new Error(clErr.message);
  const checklist = cl as CompetitionChecklist;
  // Get template items to create initial check rows
  const { data: items, error: itemsErr } = await supabase
    .from("checklist_items")
    .select("id")
    .eq("checklist_id", templateId);
  if (itemsErr) throw new Error(itemsErr.message);
  if (items && items.length > 0) {
    const rows = items.map((item: any) => ({
      competition_checklist_id: checklist.id,
      checklist_item_id: item.id,
      checked: false,
    }));
    const { error: insertErr } = await supabase
      .from("competition_checklist_checks")
      .insert(rows);
    if (insertErr) throw new Error(insertErr.message);
  }
  return checklist;
}

export async function toggleChecklistCheck(checkId: string, checked: boolean): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("competition_checklist_checks")
      .update({ checked, checked_at: checked ? new Date().toISOString() : null })
      .eq("id", checkId)
  );
}

export async function removeCompetitionChecklist(competitionChecklistId: string): Promise<void> {
  if (!canUseSupabase()) throw new Error("Supabase not available");
  assertSupabase(
    await supabase
      .from("competition_checklists")
      .delete()
      .eq("id", competitionChecklistId)
  );
}
