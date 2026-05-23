/**
 * preserveMesocycleTag — invariant d'édition coach d'une séance de mésocycle (§299).
 *
 * Le revert (`revert_strength_mesocycle`) supprime les items via
 * `raw_payload->>'mesocycle_id'`. Pour qu'un revert ultérieur nettoie
 * correctement une séance éditée par le coach (items modifiés ET ajoutés),
 * chaque item d'une séance appartenant à un mésocycle doit **conserver** ce tag.
 *
 * Règle : si l'item précédent portait un `mesocycle_id`, il est réimposé sur le
 * nouveau payload (le tag `prev` fait autorité — un éditeur ne peut pas
 * réaffecter un item à un autre mésocycle, ni le détacher). Hors mésocycle
 * (`prev.mesocycle_id` absent), aucun tag n'est fabriqué.
 */
type Payload = Record<string, unknown> & { mesocycle_id?: string };

export function preserveMesocycleTag(
  next: Payload,
  prev: Payload | null | undefined,
): Payload {
  const tag = prev?.mesocycle_id;
  if (tag == null) return next;
  return { ...next, mesocycle_id: tag };
}
