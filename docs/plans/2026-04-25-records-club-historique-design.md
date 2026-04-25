# Design — Records club filtrés par appartenance historique au club

*Date : 2026-04-25 — Statut : validé, prêt pour writing-plans*

## Problème

Les records club EAC agrégés par `recalculateClubRecords()` (edge function `import-club-records`) prennent en compte **toutes** les performances FFN des nageurs actuellement actifs, sans tenir compte du club d'appartenance au moment de la performance. Conséquence : un nageur arrivé d'un autre club apporte ses bests historiques au palmarès EAC, ce qui fausse les records.

La FFN expose le club au moment de la performance dans la vue "Performances" (URL `nat_recherche.php?idrch_id=<IUF>&idopt=prf&idbas={25,50}`) qu'on parse déjà, mais le parser actuel l'ignore.

## Décisions cadres (validées)

1. **Portée** : filtrage uniquement sur `club_records` + `club_performances`. La table `swimmer_performances` reste la carrière complète du nageur — on ne supprime rien à l'import.
2. **Identification du club** : par **libellé exact** (FFN ne fournit pas de code club sur cette page, seul le nom en clair). Stocké en `app_settings.home_club_name` pour rester configurable.
3. **Backfill** : un re-import `full` post-migration peuple `club_name` sur les rows existantes via `onConflict` UPDATE.
4. **Mécanisme de matching** : égalité stricte sur `home_club_name`. Si FFN renomme le club, 1 update SQL pour rétablir.

## Format FFN observé

Vérifié sur IUF 879576, page `idopt=prf&idbas=25`. Chaque ligne `<tr>` contient 10 cellules :

| Index | Contenu                                  |
|-------|------------------------------------------|
| 0     | `<th>` épreuve (`50 NL`)                 |
| 1     | temps (`00:23.83`)                       |
| 2     | âge (`(25 ans)`)                         |
| 3     | points (`1185 pts`)                      |
| 4     | lieu compétition (`GUEBWILLER (FRA)`)    |
| 5     | date (`17/11/2024`)                      |
| 6     | niveau (`[DEP]`)                         |
| 7     | bouton lien résultats (avec `idcpt=...`) |
| 8     | **club** (`ERSTEIN AQUATIC CLUB`)        |
| 9     | vide                                     |

Le footer FFN confirme : *"Le club indiqué est la structure d'appartenance du nageur au moment de la réalisation de la performance"*.

Le parser actuel capture la cellule 4 comme `competition_name` via une heuristique (1ère cellule non-date/non-pts/non-numérique) — la cellule 8 (club) est skippée par `if (!competitionName)`. Donc l'extraction club est purement additive, aucune régression sur les autres champs.

## Architecture

### Schéma DB (1 migration)

```sql
-- 00144_swimmer_performances_club.sql (numéro à confirmer au plan)
ALTER TABLE swimmer_performances ADD COLUMN club_name TEXT;
CREATE INDEX idx_perf_club_name ON swimmer_performances(club_name)
  WHERE club_name IS NOT NULL;

INSERT INTO app_settings (key, value, description) VALUES (
  'home_club_name',
  '"ERSTEIN AQUATIC CLUB"'::jsonb,
  'Libellé FFN exact du club. Filtre les records club aux perfs nagées sous ce maillot.'
) ON CONFLICT (key) DO NOTHING;
```

`club_name` NULLable. NULL = "club inconnu / pré-feature" → exclu du recalc (fail-safe). Pas d'impact sur la contrainte UNIQUE existante (`swimmer_iuf, event_code, pool_length, competition_date, time_seconds`).

### Parser — `supabase/functions/_shared/ffn-parser.ts`

Ajout du champ `club_name` à `RecFull` :

```ts
export interface RecFull extends Rec {
  competition_name: string | null;
  competition_location: string | null;
  swimmer_age: number | null;
  club_name: string | null;
}
```

Extraction dans `parseHtmlFull` : on garde la liste de cellules brutes (avec HTML), puis on cherche **la dernière cellule textuelle non-vide qui n'est ni un bouton ni un lien** (regex `<button|<a `). Cette approche reste robuste si FFN ajoute une colonne en fin de ligne. Validation finale : si la valeur matche une date, contient `pts`, ou est purement numérique, on rejette (NULL).

### Edge functions

**`ffn-performances/index.ts`** et **`import-club-records/index.ts`** : ajouter `club_name: p.club_name` dans le mapping vers `swimmer_performances.upsert(...)`. L'`onConflict` met à jour les rows existantes au passage. Aucune autre modif sur ces fichiers.

### Recalcul — `recalculateClubRecords()`

Lecture du libellé maison une fois en début de fonction :

```ts
const { data: settings } = await supabaseAdmin
  .from("app_settings").select("value")
  .eq("key", "home_club_name").single();
const homeClubName = (settings?.value as string) ?? "ERSTEIN AQUATIC CLUB";
```

Filtre dans la boucle `for (const perf of allPerfs)` (immédiatement après `swimmerInfo`/`normalizedCode` checks) :

```ts
if (perf.club_name !== homeClubName) {
  stats.skipped_other_club++;
  continue;
}
```

Ajout du compteur `skipped_other_club: number` à l'interface `RecalcStats` pour observabilité (surface dans la response JSON, utile pour repérer un drop anormal après un changement de libellé FFN).

Tout le reste (cascade par âge, upsert `club_performances`/`club_records`) reste inchangé.

### Backfill

Un seul run de `import-club-records` mode `full` post-migration suffit :

1. Pour chaque nageur actif : fetch FFN → upsert `swimmer_performances` (l'`onConflict` UPDATE remplit `club_name`)
2. `recalculateClubRecords()` qui filtre via `home_club_name`

Coût : ~45s (~30 nageurs × 1.5s delay) + parsing. Trigger possible via `gh workflow run` ou directement depuis l'UI admin existante (bouton "Importer records club").

Edge case : un nageur dont l'historique FFN ne couvre pas une perf existante → row reste à `club_name = NULL` → exclue du recalc. Acceptable.

## Frontend

**Hors scope** de ce chantier. Le filtrage opère côté DB, l'affichage côté UI ne change pas (les records affichés sont déjà les `club_records` recalculés). Affichage du `club_name` à côté de chaque ligne dans "Mes performances" peut faire l'objet d'un §170 séparé si jugé utile.

## Tests

- **Unit (Vitest)** : extraire la logique de parsing dans un helper testable et écrire un test sur fixture HTML capturée (extraits de `/tmp/ffn-prf-25.html` au moment du dev). Vérifier :
  - `club_name = "ERSTEIN AQUATIC CLUB"` extrait sur ligne avec club
  - `club_name = null` si cellule club vide ou bouton uniquement
  - Régression : `competition_name`, `time_seconds`, `record_date` inchangés
- **Pas de RLS test** : aucune policy touchée, recalc tourne en `service_role`.
- **Validation manuelle post-déploiement** : trigger `import-club-records full` sur un nageur de test → check `swimmer_performances.club_name IS NOT NULL` + `club_records` cohérents.

## Risques

| Risque | Impact | Mitigation |
|---|---|---|
| FFN renomme "ERSTEIN AQUATIC CLUB" | Records cassent jusqu'à update setting | Monitoring via `skipped_other_club` dans `recalc_stats` |
| FFN change la position de la cellule club | Parser rate l'extraction | Heuristique "dernière cellule non-bouton" plus robuste qu'index dur |
| Perfs très anciennes (cellule club vide) | Exclues du recalc | Acceptable — cas rare pour les nageurs actuels |
| Faux positif sur libellé proche | Aucun club ne contient exactement "ERSTEIN AQUATIC CLUB" en France | Égalité stricte (pas de regex) |

## Documentation à mettre à jour

À la fin du chantier (§169) :
- `docs/implementation-log.md` — entrée §169
- `docs/ROADMAP.md` — ligne §169 + statut, mettre à jour `*Dernière mise à jour*`
- `docs/FEATURES_STATUS.md` — feature "Records club" passe de ⚠️ à ✅ (cohérence historique)
- `CLAUDE.md` — bump "Dernière entrée en date : §169" + version edge function `import-club-records`
- Pas de modif `docs/claude/files-map.md` (aucun nouveau fichier, modifs < 30% sur ceux touchés)
