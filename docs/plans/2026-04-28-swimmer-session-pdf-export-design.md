# Export PDF séance — version nageur

**Date :** 2026-04-28
**Statut :** Design validé, prêt pour implémentation

## Contexte

Le PDF "bord de bassin" pour le coach est livré (§165/§166) via `src/lib/export-session-pdf.ts`. Le nageur doit pouvoir télécharger le **même PDF** depuis sa page de détail de séance assignée (`SwimSessionView`).

## Contrainte

L'`Assignment` côté nageur n'embarque pas l'horaire/lieu/groupes du créneau (contrairement à `SlotInstance` côté coach). Données disponibles : `assigned_date`, `assigned_slot` ("morning"/"evening"), `session_id`, `items`.

## Design

### Refacto `exportSessionPdf` — header générique

Remplacer le paramètre `SlotInstance` par un type générique `SessionHeaderInfo` :

```typescript
type SessionHeaderInfo = {
  date: string;              // YYYY-MM-DD
  timeRange?: string | null; // "07:30 – 09:00" ou "Matin"
  location?: string | null;
  groups?: string | null;    // "Performance, Compétition"
  filenameSlug?: string;     // override pour le nom de fichier
};

export async function exportSessionPdf(
  session: SwimSessionTemplate,
  header: SessionHeaderInfo,
): Promise<void>
```

`drawMetadataBand` continue d'ignorer gracieusement les valeurs nulles (déjà géré via `.filter(Boolean)`).

### Coach — wrapper trivial

```typescript
await exportSessionPdf(session, {
  date: instance.date,
  timeRange: `${formatTime(instance.slot.start_time)} – ${formatTime(instance.slot.end_time)}`,
  location: instance.slot.location,
  groups: instance.groups.map(g => g.group_name).join(", "),
  filenameSlug: `coach-seance-${instance.date.replaceAll("-", "")}`,
});
```

### Nageur — nouveau handler

Dans `SwimSessionView.tsx`, ajouter un bouton `FileDown` à côté du bouton Share existant. Handler :

```typescript
await exportSessionPdf(session, {
  date: assignment.assigned_date.slice(0, 10),
  timeRange: assignment.assigned_slot === "morning" ? "Matin"
           : assignment.assigned_slot === "evening" ? "Soir"
           : null,
  // location et groups → null, bandeau s'adapte
  filenameSlug: `seance-${assignment.assigned_date.slice(0, 10).replaceAll("-", "")}`,
});
```

### Récupération du `SwimSessionTemplate`

`SwimSessionView` n'a que `assignment.items` (pas le full template avec name/description/etc). On fetch via `api.getSwimSessionById(assignment.session_id)` avec cache React Query `["swim-session-preview", sessionId]` (clé partagée avec le coach pour bénéficier du cache si déjà fetché).

## Fichiers touchés

- `src/lib/export-session-pdf.ts` — refacto signature
- `src/pages/coach/SlotSessionSheet.tsx` — adapter l'appel existant
- `src/pages/SwimSessionView.tsx` — nouveau bouton + handler

Aucun nouveau fichier. ~50 lignes touchées.

## Tests

- `npx tsc --noEmit` — aucune erreur
- `npm test` — pas de régression sur les tests existants
- Validation manuelle : nageur clique → PDF identique visuellement au coach, header adapté
