/** API Strength Assessments — CRUD des bilans muscu (Chantier B). */
import { supabase, canUseSupabase, assertSupabase } from './client';
import type {
  StrengthAssessment,
  StrengthPhysicalTests,
  StrengthQuestionnaire,
} from './types';

export interface CreateAssessmentInput {
  athlete_id: number;
  coach_id: number | null;
}

export async function createAssessment(
  input: CreateAssessmentInput,
): Promise<StrengthAssessment> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  const data = assertSupabase(
    await supabase
      .from('strength_assessments')
      .insert({ athlete_id: input.athlete_id, coach_id: input.coach_id })
      .select()
      .single(),
  );
  return data as StrengthAssessment;
}

export async function getLatestAssessment(
  athleteId: number,
): Promise<StrengthAssessment | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(
    await supabase
      .from('strength_assessments')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(1),
  );
  const rows = (data ?? []) as StrengthAssessment[];
  return rows[0] ?? null;
}

export async function getAssessment(
  id: string,
): Promise<StrengthAssessment | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(
    await supabase
      .from('strength_assessments')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
  );
  return (data as StrengthAssessment | null) ?? null;
}

export async function listAssessments(
  athleteId: number,
): Promise<StrengthAssessment[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from('strength_assessments')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false }),
  );
  return (data ?? []) as StrengthAssessment[];
}

/**
 * Renvoie les `physical_tests` du dernier bilan **complété** de l'athlète,
 * optionnellement en excluant un id (le bilan en cours). Sert à afficher la
 * note de mobilité/mouvement précédente à côté de la nouvelle (§301 T5 —
 * comparaison dans le temps). `null` si aucun bilan complété antérieur, ou si
 * ce bilan n'avait pas de notation physique. Mêmes RLS que les autres lectures
 * d'assessments (pas de nouvelle policy).
 */
export async function getPreviousCompletedPhysicalTests(
  athleteId: number,
  excludeId?: string,
): Promise<StrengthPhysicalTests | null> {
  if (!canUseSupabase()) return null;
  let query = supabase
    .from('strength_assessments')
    .select('id, physical_tests, created_at')
    .eq('athlete_id', athleteId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1);
  if (excludeId != null) query = query.neq('id', excludeId);
  const data = assertSupabase(await query);
  const rows = (data ?? []) as { physical_tests: StrengthPhysicalTests | null }[];
  return rows[0]?.physical_tests ?? null;
}

export async function updateAssessmentQuestionnaire(
  id: string,
  questionnaire: StrengthQuestionnaire,
): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  // Use RETURNING id via .select() to detect §113-style silent no-op.
  const data = assertSupabase(
    await supabase
      .from('strength_assessments')
      .update({ questionnaire, status: 'bilan_pending' })
      .eq('id', id)
      .select('id'),
  );
  if (!data || data.length === 0) {
    throw new Error('Assessment not found or not allowed to update');
  }
}

export async function updateAssessmentPhysicalTests(
  id: string,
  physicalTests: StrengthPhysicalTests,
): Promise<void> {
  if (!canUseSupabase()) throw new Error('Supabase not available');
  // Use RETURNING id via .select() to detect §113-style silent no-op.
  const data = assertSupabase(
    await supabase
      .from('strength_assessments')
      .update({ physical_tests: physicalTests, status: 'completed' })
      .eq('id', id)
      .select('id'),
  );
  if (!data || data.length === 0) {
    throw new Error('Assessment not found or not allowed to update');
  }
}
