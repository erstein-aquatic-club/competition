# Design : Attribution Coach ↔ Nageur

## Contexte

Actuellement, tous les coachs voient tous les nageurs. On veut qu'un nageur soit attribué à 1 coach principal. Le coach ne voit que ses nageurs dans les vues personnelles (entretiens, ressentis, notifications, SMS, fiche nageur). Les vues partagées (chrono, calendrier créneaux) restent accessibles à tous.

## Modèle de données

### Table `coach_swimmer_assignments`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | |
| `coach_id` | int FK → users | Le coach référent |
| `swimmer_id` | int FK → users | Le nageur attribué |
| `assigned_at` | timestamptz | Date d'attribution |
| `assigned_by` | int FK → users | Qui a fait l'attribution |

Contraintes : `UNIQUE(swimmer_id)` — 1 seul coach par nageur.

### Table `coach_swimmer_history`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | |
| `coach_id` | int | Coach qui avait le nageur |
| `swimmer_id` | int | Le nageur |
| `assigned_at` | timestamptz | Début |
| `removed_at` | timestamptz | Fin |
| `removed_by` | int | Qui a retiré |

Alimentée par trigger sur DELETE/UPDATE de `coach_swimmer_assignments`.

### RLS

- Coachs : INSERT (nageurs non-attribués), DELETE (leurs propres nageurs), SELECT (leurs attributions + non-attribués)
- Admins : tout (INSERT, UPDATE, DELETE sur toutes les attributions)

## Interface

### Nouvel écran "Gérer mes nageurs"

- Section "Mes nageurs" avec bouton retirer (confirmation dialog)
- Section "Nageurs disponibles" avec bouton prendre en charge
- Recherche/filtre par nom
- Admin : voit tous les nageurs groupés par coach + réattribution

### Filtrage des vues existantes

| Vue | Filtré coach | Accès tous |
|-----|-------------|------------|
| Nageurs overview | ✅ | ❌ |
| Entretiens | ✅ | ❌ |
| Ressentis | ✅ | ❌ |
| SMS | ✅ | ❌ |
| Notifications | ✅ | ❌ |
| Fiche nageur | ✅ | ❌ |
| Chrono | Défaut ✅ | Toggle tout le club |
| Calendrier créneaux | ❌ | Par créneau |

## Décisions

- Attribution initiale : tous les nageurs démarrent non-attribués
- Admin + coach peuvent attribuer
- Historique conservé automatiquement
- 1 coach principal par nageur strict
