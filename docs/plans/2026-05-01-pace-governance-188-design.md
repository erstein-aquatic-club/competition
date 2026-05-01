# §188 — Gouvernance et versioning des paramètres d'allures

*Design validé le 2026-05-01. Source métier : `regles_calcul_allures_natation.docx` §14. Précondition : §186 et §187 livrés.*

## 1. Contexte

Le doc §14 impose que chaque modification de paramètres (zones, ratios, ajustements de nage, corrections de contexte, tests) soit **versionnée** avec date, auteur, groupe concerné et justification. Une table périmée doit être recalculée après changement d'objectif compétition, blessure, changement de cycle ou modification du protocole de chrono.

§188 implémente cet audit trail et la signalétique de péremption.

## 2. Décisions de conception

| # | Décision | Justification |
|---|---|---|
| C1 | Audit trail via une table générique `pace_params_changelog` plutôt qu'une colonne par table | Évite la duplication ; permet une vue historique unifiée |
| C2 | Pas de tracking automatique sur `coach_pace_targets` (les cibles changent souvent et ne sont pas un "paramètre") | Limite le bruit dans le log |
| C3 | Péremption : 90 jours pour les tests, 180 jours pour les zones/ratios/adjustments, configurable par coach | Valeurs initiales raisonnables, le coach ajuste |
| C4 | Disclaimer affiché en lecture (PDF, page partagée, matrice écran) | Conformité §14 doc |

## 3. Modèle de données

### 3.1. Migration `00153_pace_governance.sql`

```sql
-- (a) Audit trail unifié
CREATE TABLE pace_params_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  param_kind text NOT NULL CHECK (param_kind IN (
    'pace_zones',          -- coach_pace_zones_v2
    'stroke_adjustments',  -- coach_stroke_adjustments
    'pace_corrections',    -- coach_pace_corrections
    'swimmer_test'         -- swimmer_pace_tests
  )),
  param_ref jsonb NOT NULL,    -- ex: {"event_family":"100m","zone":"V3"}
  old_value jsonb,             -- null si insertion
  new_value jsonb,             -- null si suppression
  reason text,                 -- justification optionnelle saisie par le coach
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_changelog_coach_changed ON pace_params_changelog (coach_id, changed_at DESC);
ALTER TABLE pace_params_changelog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pace_params_changelog_select_own"
  ON pace_params_changelog FOR SELECT USING (coach_id = (SELECT auth.uid()));
-- Pas de policy INSERT/UPDATE/DELETE direct : alimenté par triggers SECURITY DEFINER
GRANT SELECT ON pace_params_changelog TO authenticated;

-- (b) Triggers d'audit (1 par table tracée)
CREATE OR REPLACE FUNCTION log_pace_param_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text;
  v_ref jsonb;
BEGIN
  v_kind := TG_ARGV[0];
  CASE v_kind
    WHEN 'pace_zones' THEN
      v_ref := jsonb_build_object('event_family', COALESCE(NEW.event_family, OLD.event_family),
                                   'zone', COALESCE(NEW.zone, OLD.zone));
    WHEN 'stroke_adjustments' THEN
      v_ref := jsonb_build_object('stroke', COALESCE(NEW.stroke, OLD.stroke),
                                   'event_family', COALESCE(NEW.event_family, OLD.event_family));
    WHEN 'pace_corrections' THEN
      v_ref := jsonb_build_object('correction_kind', COALESCE(NEW.correction_kind, OLD.correction_kind),
                                   'repetition_distance_m', COALESCE(NEW.repetition_distance_m, OLD.repetition_distance_m));
    WHEN 'swimmer_test' THEN
      v_ref := jsonb_build_object('test_id', COALESCE(NEW.id, OLD.id));
  END CASE;

  INSERT INTO pace_params_changelog (coach_id, param_kind, param_ref, old_value, new_value)
  VALUES (
    COALESCE(NEW.coach_id, OLD.coach_id),
    v_kind,
    v_ref,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_pace_zones_audit
  AFTER INSERT OR UPDATE OR DELETE ON coach_pace_zones_v2
  FOR EACH ROW EXECUTE FUNCTION log_pace_param_change('pace_zones');

CREATE TRIGGER trg_stroke_adj_audit
  AFTER INSERT OR UPDATE OR DELETE ON coach_stroke_adjustments
  FOR EACH ROW EXECUTE FUNCTION log_pace_param_change('stroke_adjustments');

CREATE TRIGGER trg_corrections_audit
  AFTER INSERT OR UPDATE OR DELETE ON coach_pace_corrections
  FOR EACH ROW EXECUTE FUNCTION log_pace_param_change('pace_corrections');

CREATE TRIGGER trg_swimmer_test_audit
  AFTER INSERT OR UPDATE OR DELETE ON swimmer_pace_tests
  FOR EACH ROW EXECUTE FUNCTION log_pace_param_change('swimmer_test');

-- (c) Préférences de péremption par coach
CREATE TABLE coach_pace_staleness_prefs (
  coach_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  test_max_age_days int NOT NULL DEFAULT 90 CHECK (test_max_age_days BETWEEN 30 AND 365),
  params_max_age_days int NOT NULL DEFAULT 180 CHECK (params_max_age_days BETWEEN 30 AND 365),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE coach_pace_staleness_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staleness_prefs_all_own"
  ON coach_pace_staleness_prefs FOR ALL
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));
```

## 4. UI

### 4.1. Vue "Historique des paramètres"

Nouveau bouton dans le header du calculateur d'allures : `[Historique]` → drawer ou page `/coach?section=pace-calculator&view=history`.

Liste chronologique inverse :
```
2026-04-28 14:32  · Zones · 100m V3 : 0.94 → 0.95
2026-04-25 09:10  · Test  · Léo Martin · 25m crawl : 11.40 (poussé, 25m)
2026-04-20 17:45  · Adjustment · brasse 100m : 0.04 → 0.035
```

Chaque ligne cliquable → modale détail avec old/new value + justification (si renseignée).

### 4.2. Champ "Raison du changement"

Quand le coach modifie un paramètre via l'UI :
- Drawer Zones, drawer Adjustments, drawer Corrections : champ optionnel "Raison du changement (optionnel)" en bas
- Si rempli : passé via header HTTP custom à la mutation, intercepté côté API et logué via une RPC dédiée (les triggers ne voient que les changements de données, pas les raisons)
- **Alternative simple V1** : `reason` saisi côté UI passé en argument d'une RPC `update_pace_zones_with_reason(...)` qui fait l'UPDATE + l'INSERT dans le changelog dans une transaction. Pas de triggers, simplification du code.

**Décision V1 : RPC dédiée plutôt que triggers**, plus explicite, moins de magic. Les triggers SQL ci-dessus deviennent du code mort si on ne les active pas.

### 4.3. Disclaimers de péremption

Sur chaque matrice :
- Si dernière modif des zones > 180j : badge `[Zones non révisées depuis X mois]` en jaune
- Si tests utilisés > 90j : badge `[Calibration ancienne]` en orange
- Si aucun test pour ce nageur : badge `[Théorique seul]` en gris (informatif, pas alerte)

Sur le PDF : les badges sont reproduits dans le footer.

Sur la page partagée publique : disclaimer en footer mentionnant la date de génération + la version des paramètres.

### 4.4. Préférences de péremption

Drawer accessible depuis l'historique : 2 sliders (test_max_age, params_max_age) avec range 30-365 jours.

## 5. API

- `src/lib/api/pace-changelog.ts` : list (filtres : coach, param_kind, date range)
- `src/lib/api/pace-staleness-prefs.ts` : read/upsert
- RPC `upsert_pace_zones_with_reason(p_event_family, p_zone, p_k_value, p_reason)` : transaction (UPDATE + INSERT changelog)
- Idem pour adjustments, corrections, tests

## 6. Tests

### 6.1. Triggers / RPCs

- `pace_params_changelog.test.ts` (RLS + comportement) :
  - INSERT zone → 1 row dans changelog
  - UPDATE zone → 1 row avec old + new
  - DELETE zone → 1 row avec old, new=null
  - coach B ne voit pas les changes de coach A
  - RPC avec reason → row contient reason

### 6.2. Composants

- `PaceParamsHistoryView.test.tsx` : pagination, filtres, render des changes
- `StalenessPrefsDrawer.test.tsx` : sliders + persistance

### 6.3. Logique métier

- `staleness.test.ts` : `isStale(date, max_age_days)` ; calcul des badges

## 7. Plan de livraison

1. Migration 00153 (RPCs sans triggers en V1)
2. API + tests RPCs + RLS
3. UI historique + raison
4. Badges péremption sur matrices / PDF / public
5. Préférences péremption
6. Doc

## 8. Risques

| Risque | Mitigation |
|---|---|
| Coach noyé sous les badges péremption | Limite à 1 badge par catégorie (zones / tests / théorique). Pas de spam. |
| Champ "raison" jamais rempli (UX surchargée) | Optionnel par défaut. On ne bloque pas la mutation. |
| Changelog grossit indéfiniment | Politique de purge : > 2 ans = soft archive (non visible UI mais conservé en DB pour audit). À voir en pratique. |

## 9. Hors scope §188

- Notifications push "vos zones n'ont pas été révisées depuis 6 mois" → §189+
- Snapshot d'une matrice à un instant T (pour comparaison "avant/après") → §189+
- Export CSV de l'historique → §189+
