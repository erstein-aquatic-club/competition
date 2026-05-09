# Design — Suppression complète du Neurotype (§231)

*Date : 2026-05-09*

## Contexte

Le NeurotypQuiz n'est plus utilisé. Il faut supprimer toute trace frontend sans toucher aux migrations SQL déjà appliquées en prod.

## Périmètre

### Fichiers à supprimer
- `src/components/neurotype/NeurotypQuiz.tsx`
- `src/components/neurotype/NeurotypResult.tsx`
- `src/components/neurotype/` (dossier vide après suppression)
- `src/lib/neurotype-quiz-data.ts`
- `src/lib/neurotype-scoring.ts`

### Fichiers à nettoyer
- `src/pages/Profile.tsx` — imports, type union, state, mutation, guards
- `src/lib/api/types.ts` — interfaces NeurotypScores/NeurotypCode/NeurotypResult + champ neurotype_result sur UserProfile
- `src/lib/api/users.ts` — import NeurotypResult + références dans le mapping

### Docs à mettre à jour
- `docs/claude/files-map.md` — retirer les 4 entrées fichiers neurotype
- `docs/FEATURES_STATUS.md` — retirer ligne neurotype
- `docs/ROADMAP.md` — retirer références neurotype

## Hors scope
- Migrations SQL (`00033_neurotype_result.sql`, `00081_pagination_rpcs.sql`) — déjà appliquées en prod, intouchables
- `docs/implementation-log.md` — les entrées historiques restent
