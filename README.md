# Suivi Natation

Application web PWA de suivi sportif et opérationnel pour l'Erstein Aquatic Club : natation, musculation, objectifs, allures, compétitions, pointage des heures, notifications et administration.

**Statut actuel : production fonctionnelle, très avancée.** Tous les grands modules métier sont livrés et activés. Les derniers chantiers documentés au **2026-05-10 (§265)** ont surtout porté sur la performance perçue, l'offline, l'accessibilité et la cohérence iOS/mobile.

## Stack technique

| Catégorie | Technologies |
|-----------|-------------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| **UI** | Radix UI, Shadcn-style primitives, lucide-react, Recharts |
| **State/data** | React Query 5 + cache persisté, Zustand 5 |
| **Backend** | Supabase : PostgreSQL, Auth, RLS, Edge Functions, pg_cron |
| **PWA** | vite-plugin-pwa / Workbox, push notifications, offline queue |
| **Tests/outillage** | Node test, Vitest RLS/e2e, Storybook, TypeScript |
| **Déploiement** | GitHub Pages pour le frontend, Supabase Cloud pour le backend |

## État global

| Domaine | Statut | Commentaire |
|---------|--------|-------------|
| Fonctionnel métier | ✅ Stable | Auth, nage, muscu, coach, records, compétitions, objectifs, allures, pointage, admin |
| Mobile / PWA | ✅ Très avancé | Installation PWA, safe areas, push, offline, cache React Query, gestes mobiles |
| UI/UX | ✅ ~9.9/10 | Drapeaux majeurs fermés : typo globale, tap targets primitives, tokens couleur |
| Accessibilité | ✅ ~9.6/10 | P0/P1 WCAG traités, ARIA/focus améliorés, quelques P2 cosmétiques résiduels |
| Performance/offline | ✅ ~8.4/10 estimé | Critical path corrigé, timeouts, retry, queue offline 12/12 mutations critiques |
| Dette restante | ⚠️ Localisée | Profiling React DevTools pour memo Coach/Records, quelques migrations Surface/tokens et tap targets coach denses |

Sources principales : [`docs/FEATURES_STATUS.md`](docs/FEATURES_STATUS.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), [`docs/audits/2026-05-10-final-consolidé.md`](docs/audits/2026-05-10-final-consolidé.md), [`docs/audits/2026-05-10-perf-audit-pass2-runtime.md`](docs/audits/2026-05-10-perf-audit-pass2-runtime.md).

## Fonctionnalités livrées

### Authentification, rôles et sécurité

- Connexion Supabase Auth, refresh JWT, reset password.
- Rôles `nageur`, `coach`, `comité`, `admin`.
- Inscription self-service avec validation coach/admin.
- RLS renforcée sur les tables sensibles, tests RLS dédiés, RPC critiques sécurisées.
- Edge Functions verrouillées côté rôle/service selon usage.

### Nageur

- Dashboard calendrier natation avec créneaux matin/soir, absences, compétitions, ressenti et plan muscu.
- Saisie de ressenti, présence/absence, notes techniques par exercice, historique et progression.
- Home nageur avec bien-être, semaine compacte, prochaine compétition et accès rapide au suivi.
- Module `Suivi` découpé en sous-vues : semaine, planification, objectifs, progression.
- Profil complet : infos, avatar, sécurité, objectifs, records, entretiens.

### Natation coach

- Catalogue de séances, builder blocs/exercices, parser texte coach vers séance structurée.
- Assignation par nageur, groupe, sous-groupe, groupe temporaire et créneau.
- Gestion des créneaux récurrents, exceptions, créneaux personnalisés par nageur.
- Quick-compose sur créneau vide, PDF séance bord de bassin, partage public de séance.
- Planning natation par groupe et par nageur, overrides filière/semaine, vue nageur fusionnée.
- Chrono coach complet : lignes/vagues, nageurs club et manuels, historique, éditeur splits, export xlsx.

### Musculation

- Côté nageur : séances assignées, mode focus mobile, timer repos enrichi, saisie charge/reps, historique, 1RM, notes personnelles.
- Côté coach : builder muscu, catalogue exercices, dossiers, planification hebdomadaire groupe/nageur, copie vers athlète.
- Saisie robuste : RPC atomiques, brouillons locaux, queue offline et replay.

### Records, FFN et Hall of Fame

- Records personnels CRUD, historiques performances et graphiques.
- Import FFN individuel et historique complet via Edge Function.
- Records club recalculés avec filtre d'appartenance historique EAC.
- Hall of Fame nage et muscu.
- Admin records : gestion nageurs, imports, auto-sync hebdomadaire.

### Compétitions, objectifs et allures

- CRUD compétitions, assignations, SMS groupé, vue détail nageur.
- Préparation compétition : courses, routines, timeline jour J, checklist.
- Objectifs coach/nageur, lien objectif ↔ allures, progression par épreuve.
- Calculateur d'allures v2 non linéaire : familles 50/100/200/400/800-1500, 4 nages segmenté, conversion bassin 25/50, modulations départ plot et combinaison.
- Export PDF allures et liens de partage.

Voir aussi : [`docs/pace-calculator-scenarios.md`](docs/pace-calculator-scenarios.md).

### Communication, push et administratif

- Notifications push PWA, rappels de ressenti, auto-purge TTL, auto-mark après action.
- Inbox commentaires nageur côté coach et notifications côté nageur.
- Email coach via `mailto:` et SMS coach.
- Pointage des heures : shifts, lieux, trajets, groupes encadrés, tableaux de bord et vue comité.
- Admin utilisateurs, rôles, inscriptions en attente et configuration.

## Performance, PWA et offline

Le dernier état documenté post-§265 indique :

- Critical path revenu à 4 vendors préchargés, `vendor-motion` sorti du chemin critique.
- Service Worker allégé : environ -1.48 MiB de precache vs baseline.
- Cache React Query persisté en localStorage avec buster de build.
- Sonde réseau réelle via `HEAD /version.json`.
- Retry exponentiel + `withTimeout(8s)` sur les requêtes critiques.
- Queue offline couvrant **12/12 mutations critiques** : profil, records, absences, pointage, sauvegarde séance natation atomique, avatar.
- Toast après 5 s de chargement lent sur Dashboard, Coach et Records.

Limite connue : l'extraction/mémoïsation de certaines cards Coach/Records est volontairement bloquée en attente d'un profilage React DevTools runtime.

## Structure du projet

```text
competition/
├── src/
│   ├── pages/                  # Pages React, routes nageur/coach/admin/comité
│   ├── components/             # Composants UI et métier
│   ├── hooks/                  # Hooks React et React Query
│   └── lib/
│       ├── api/                # Modules API Supabase post-suppression façade api.ts
│       ├── auth.ts             # Auth, rôles, chargement contexte utilisateur
│       ├── supabase.ts         # Client Supabase
│       ├── offlineQueue.ts     # Queue mutations offline
│       ├── paceCalculatorV2.ts # Moteur allures v2
│       └── design-tokens.ts    # Tokens design historiques
├── supabase/
│   ├── migrations/             # Migrations PostgreSQL/RLS/RPC
│   ├── functions/              # push-send, admin-user, ffn-performances, import-club-records
│   └── tests/rls/              # Tests RLS
├── docs/                       # État fonctionnel, roadmap, audits, plans, QA
├── public/                     # Assets PWA, manifest, service worker helpers
└── .github/workflows/          # Déploiement GitHub Pages
```

## Démarrage local

### Prérequis

- Node.js 18+
- npm
- Accès Supabase si l'on veut tester contre les données réelles

### Installation

```bash
npm install
```

### Configuration

Créer un fichier `.env` à la racine :

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Sans ces variables, le build local peut réussir mais l'app affichera que Supabase n'est pas configuré.

### Développement

```bash
npm run dev
```

L'application est servie sur `http://localhost:8080`.

### Vérifications utiles

```bash
npm run check
npm test
npm run build
npm run test:rls
```

Les tests RLS demandent l'environnement Supabase local décrit dans [`docs/rls-testing.md`](docs/rls-testing.md).

## Déploiement

### GitHub Pages

> Ne pas déployer localement avec `npx gh-pages -d dist`.
> Le build local n'a pas forcément les credentials Supabase et peut produire une app non configurée.

Le frontend est déployé par GitHub Actions sur push vers `main`.

Secrets requis :

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Déploiement manuel :

```bash
gh workflow run "Deploy to GitHub Pages"
```

### Edge Functions Supabase

Les Edge Functions ne sont pas déployées automatiquement par GitHub Actions. Après modification de `supabase/functions/`, redéployer la fonction concernée :

```bash
supabase functions deploy push-send
supabase functions deploy admin-user
supabase functions deploy ffn-performances
supabase functions deploy import-club-records
```

Configurer aussi les secrets Supabase nécessaires, notamment service role, VAPID et clés liées aux imports.

## Documentation

| Document | Rôle |
|----------|------|
| [`docs/FEATURES_STATUS.md`](docs/FEATURES_STATUS.md) | Matrice détaillée des fonctionnalités et état le plus récent |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Journal roadmap synthétique, derniers § livrés et reste à faire |
| [`docs/implementation-log.md`](docs/implementation-log.md) | Source de vérité chronologique de chaque patch |
| [`docs/audits/2026-05-10-final-consolidé.md`](docs/audits/2026-05-10-final-consolidé.md) | Audit consolidé UI/UX, perf, accessibilité |
| [`docs/audits/2026-05-10-perf-audit-pass2-runtime.md`](docs/audits/2026-05-10-perf-audit-pass2-runtime.md) | Audit performance/offline détaillé |
| [`docs/plans/2026-05-10-ui-ux-roadmap-to-10.md`](docs/plans/2026-05-10-ui-ux-roadmap-to-10.md) | Chemin vers 10/10 strict et dette restante |
| [`docs/pace-calculator-scenarios.md`](docs/pace-calculator-scenarios.md) | Explication métier du calculateur d'allures |
| [`docs/rls-testing.md`](docs/rls-testing.md) | Guide tests RLS locaux |
| [`docs/claude/files-map.md`](docs/claude/files-map.md) | Carte détaillée des fichiers clés |

## Roadmap courte

Priorité actuelle recommandée par les audits :

- Stopper les gros refactors UI risqués : la valeur marginale est faible autour de 9.2-9.9/10 selon pondération.
- Faire seulement les nettoyages opportunistes : tokens `tracking-*`, quelques tap targets coach denses, adoption `Surface` fichier par fichier si une zone est déjà touchée.
- Mesurer en runtime avant d'extraire davantage : React DevTools Profiler sur Coach hub et Records.
- Garder les tests `check`, `test`, `build` et `test:rls` comme garde-fous avant PR.

## Contribuer

1. Créer une branche depuis `main`.
2. Implémenter un changement ciblé.
3. Vérifier au minimum `npm run check` et `npm run build`; ajouter `npm test` ou `npm run test:rls` selon le périmètre.
4. Créer une PR vers `main`.

---

*Dernière mise à jour README : 2026-05-10, alignée sur les docs jusqu'au §265.*
