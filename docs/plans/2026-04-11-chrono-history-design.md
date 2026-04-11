# Design — Historique Chronos Coach + Édition Splits

**Date** : 2026-04-11
**Statut** : Validé

## Objectif

Permettre au coach de sauvegarder ses séries de chrono en DB, de les retrouver dans un historique, d'éditer les splits (recaler les distances, supprimer des splits en trop) avant d'envoyer aux nageurs.

## Flow global

```
Chrono (course) → Résultats → [Envoyer direct] → INSERT swim_exercise_logs
                                                 + INSERT chrono_records (status: sent)
                             → [Enregistrer]    → INSERT chrono_records (status: draft)

Home Coach → Raccourci "Chronos" (badge brouillons) → Liste historique
  → Ouvrir brouillon → Sélecteur nageur × série → Éditer splits → Envoyer
  → Ouvrir envoyé → Vue lecture seule
```

## Persistance — Table `chrono_records`

```sql
chrono_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'sent'
  label TEXT,                             -- ex: "4×100m"
  config JSONB NOT NULL,                  -- { totalDistanceM, splitDistanceM, seriesCount, laneCount }
  swimmers JSONB NOT NULL,                -- array (voir structure ci-dessous)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
)
```

**RLS** : coach voit/gère ses propres records (`coach_id = auth.uid()`).
**Fallback** : localStorage si offline, sync au retour en ligne.

### Structure `swimmers` JSONB

```ts
interface ChronoRecordSwimmer {
  athleteId: number;
  displayName: string;
  lane: number;
  wave: number;
  splitsByRep: {
    distanceM: number;    // distance réelle (éditable pour recalage)
    cumulativeMs: number; // temps cumulé brut
    lapMs: number;        // partiel (recalculé si distances changent)
  }[][];
}
```

Chaque split porte son `distanceM` individuellement (pas calculé depuis l'index) pour permettre le recalage après coup.

## Opérations DB

| Action | SQL |
|--------|-----|
| Enregistrer brouillon | `INSERT chrono_records (status: 'draft')` |
| Éditer splits | `UPDATE chrono_records SET swimmers = ..., updated_at = now()` |
| Envoyer | `INSERT swim_exercise_logs` pour chaque nageur + `UPDATE chrono_records SET status = 'sent'` |
| Envoi direct (résultats) | `INSERT swim_exercise_logs` + `INSERT chrono_records (status: 'sent')` |
| Supprimer brouillon | `DELETE chrono_records` |

## Phase Résultats (modifiée)

Deux boutons :
- **"Envoyer à tous"** — résout UUID, insère swim_exercise_logs, sauvegarde chrono_record en "sent"
- **"Enregistrer (brouillon)"** — sauvegarde chrono_record en "draft", toast, retour au setup

## Home Coach — Raccourci

Card dans la grille quick links :
- Icône Timer, label "Chronos"
- Badge orange si brouillons en attente (ex: "2")
- Clic → `/coach?section=chrono-history`

## Vue Historique (`chrono-history`)

Liste chronologique :
- Chaque entrée : date relative, label (ex: "4×100m"), nombre de nageurs, statut
- Pastille "Brouillon" (orange) / "Envoyé" (vert)
- Clic brouillon → éditeur
- Clic envoyé → vue lecture seule
- Bouton supprimer

## Éditeur de splits (brouillon)

**Navigation** :
- Sélecteur de nageur : tabs horizontaux (nom + chip vague)
- Sélecteur de série : tabs secondaires "S1 | S2 | S3..." (si multi-rep)
- On édite un nageur × une série à la fois

**Tableau éditable** :
| Distance | Cumul | Partiel | |
|----------|-------|---------|-|
| `[50]m` | 0:32.4 | 0:32.4 | ✕ |
| `[150]m` | 1:05.8 | 0:33.4 | ✕ |
| `[200]m` | 1:40.1 | 0:34.3 | ✕ |

- **Distance** : input éditable, pré-rempli depuis splitDistanceM × index
- **Cumul** : lecture seule (temps brut enregistré)
- **Partiel** : recalculé automatiquement
- **✕** : supprimer le split

**Actions** :
- "Envoyer ce nageur" — envoie uniquement ce nageur
- "Envoyer tous" — envoie tous les nageurs du brouillon
- "Supprimer ce chrono" — supprime le record
