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

/**
 * Réconcilie les `raw_payload` lors de la sauvegarde d'une séance éditée par le
 * coach (§300, Part 1). Le builder reconstruit les items « à plat » (sans
 * `raw_payload`) ; on ré-attache le `raw_payload` d'origine par corrélation sur
 * `ordre`, et — si la séance appartient à un mésocycle (au moins un item porte
 * `mesocycle_id`) — on **impose ce tag à tous les items**, y compris ceux
 * **ajoutés** par le coach (absents de la source) → le revert les nettoiera.
 *
 * Hors mésocycle (aucun item taggé), les `raw_payload` d'origine sont rendus
 * tels quels (typiquement `null`) — zéro changement de comportement.
 *
 * @param ordres        ordres des items reconstruits, dans l'ordre de sauvegarde
 * @param sourceByOrdre map `ordre` → `raw_payload` d'origine (séance chargée)
 * @returns un `raw_payload` (ou `null`) par item, aligné sur `ordres`
 */
export function reconcileMesocyclePayloads(
  ordres: number[],
  sourceByOrdre: Map<number, Payload | null | undefined>,
): Array<Payload | null> {
  const sessionTag = [...sourceByOrdre.values()].find(
    (p): p is Payload => !!p && typeof p === "object" && p.mesocycle_id != null,
  );
  return ordres.map((ordre) => {
    const existing = sourceByOrdre.get(ordre) ?? null;
    if (!sessionTag) return existing ?? null;
    return preserveMesocycleTag((existing ?? {}) as Payload, sessionTag);
  });
}
