/**
 * API Strength Periodization Templates — Chantier A (§292).
 *
 * Lecture seule côté nageur (RLS `spt_select` ouvre la table à tous les
 * authentifiés). L'écran de génération du mésocycle (§293, Phase 5) filtre
 * ensuite par `event_group` + `kind`.
 */
import { supabase, canUseSupabase, assertSupabase } from './client';
import type { StrengthPeriodizationTemplate } from './types';

export interface ListTemplatesOptions {
  /** Filtre `event_group` exact (ex : `'sprint_50'`, `'400m'`). */
  eventGroup?: string;
  /** Filtre famille : `'season'` (prépa de saison) ou `'inter_competition'`. */
  kind?: 'season' | 'inter_competition';
}

/**
 * Liste les templates de périodisation, triés par nom — ordre stable pour l'UI.
 *
 * Sans filtre : renvoie tous les templates (14 en seed §292). Avec filtre :
 * permet à l'écran de génération nageur de proposer seulement les templates
 * compatibles avec l'épreuve + famille choisie.
 */
export async function listStrengthPeriodizationTemplates(
  options: ListTemplatesOptions = {},
): Promise<StrengthPeriodizationTemplate[]> {
  if (!canUseSupabase()) return [];
  let query = supabase.from('strength_periodization_templates').select('*');
  if (options.eventGroup) query = query.eq('event_group', options.eventGroup);
  if (options.kind) query = query.eq('kind', options.kind);
  const data = assertSupabase(await query.order('name'));
  return (data ?? []) as StrengthPeriodizationTemplate[];
}

/**
 * Récupère un template par id. `null` si absent ou RLS refuse.
 */
export async function getStrengthPeriodizationTemplate(
  id: string,
): Promise<StrengthPeriodizationTemplate | null> {
  if (!canUseSupabase()) return null;
  const data = assertSupabase(
    await supabase
      .from('strength_periodization_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
  );
  return (data as StrengthPeriodizationTemplate | null) ?? null;
}

/**
 * Renvoie la liste distincte des `event_group` présents dans le catalogue de
 * templates. Sert au sélecteur d'épreuve de l'écran de génération.
 */
export async function listStrengthTemplateEventGroups(): Promise<string[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from('strength_periodization_templates')
      .select('event_group')
      .order('event_group'),
  );
  const rows = (data ?? []) as Array<{ event_group: string }>;
  return Array.from(new Set(rows.map((r) => r.event_group)));
}
