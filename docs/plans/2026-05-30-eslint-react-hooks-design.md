# Design — Infra eslint : garde-fou `react-hooks/rules-of-hooks` en CI

> **Date** : 2026-05-30
> **Origine** : synthèse de l'audit flux mésocycle (§344) — le bug React #310 (hook après early return) a frappé 3× (§316, §326) ; aucun garde-fou automatique. Le dépôt n'a **aucun eslint**.
> **Statut** : design validé (brainstorming). Suite : plan (`writing-plans`).

## Contexte

`react-hooks/rules-of-hooks` détecte les hooks appelés conditionnellement / après un `return` anticipé — exactement la classe de bug #310 récurrente. Le projet n'a ni eslint, ni script `lint`, ni CI de lint (seul `pages.yml` build+déploie sur push `main`, Node 24). 18 fichiers ont déjà des commentaires `eslint-disable` (dont des `react-hooks/exhaustive-deps`), preuve qu'un eslint était attendu.

## Décision (validée)

**Eslint minimal, react-hooks uniquement** (zéro flot d'issues pré-existantes) : `react-hooks/rules-of-hooks` en **ERREUR** (le garde-fou), `react-hooks/exhaustive-deps` en **WARN** (des `eslint-disable` existent déjà ; un warning ne bloque pas). **Garde CI** : étape `npm run lint` dans `pages.yml` **avant le build** → un push qui viole `rules-of-hooks` fait échouer le déploiement. (Écartées : ruleset large = gros nettoyage préalable ; workflow CI séparé = ne bloque pas le déploiement vu le flux push-on-main.)

## Architecture

- **Deps (dev)** : `eslint@^9`, `@eslint/js`, `typescript-eslint@^8` (parser flat, **sans type-aware** → rapide, pas de `project` service), `eslint-plugin-react-hooks@^5` (flat-config + React 19), `globals`.
- **`eslint.config.js`** (flat config, racine) :
  - `ignores`: `dist`, `node_modules`, `public`, `supabase`, `*.config.{js,ts}`, `dev-dist`, etc.
  - bloc TS/TSX : `files: ['src/**/*.{ts,tsx}']`, `languageOptions` { parser: tseslint.parser, ecmaVersion latest, sourceType module, globals: browser } ; `plugins: { 'react-hooks': reactHooks }` ; `rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' }`.
  - Rien d'autre (pas de `@eslint/js` recommended ni typescript-eslint recommended → pas de flot).
- **Script** `package.json` : `"lint": "eslint ."`. Exit 1 sur une erreur (rules-of-hooks), exit 0 si seulement des warnings.
- **CI** : dans `.github/workflows/pages.yml`, après `npm ci` et avant `npm run build`, ajouter `- run: npm run lint`.

## Vérification

- `npm run lint` passe **vert aujourd'hui** : 0 erreur `rules-of-hooks` (les hooks sont propres), quelques warnings `exhaustive-deps` tolérés (non bloquants).
- **Preuve que la garde marche** (équivalent du « watch it fail ») : introduire TEMPORAIREMENT un hook après un early return dans un composant → `npm run lint` doit **échouer** (erreur `rules-of-hooks`) → retirer la violation. Documente que le garde-fou attrape bien le #310.

## Hors scope

- Nettoyage des warnings `exhaustive-deps` existants (volontairement non bloquants).
- Règles TS/style/import (calibrage anti-flot — chantier séparé si voulu un jour).
- Lint des fichiers hors `src` (config, supabase, scripts).

## Risques

- Compat flat-config eslint 9 × `eslint-plugin-react-hooks` v5 × React 19 → vérifier que le plugin expose bien ses règles en flat (v5.2+ OK). Si un souci de résolution, fallback : config plate manuelle pointant la règle.
- `npm run lint` doit ignorer correctement `dist`/`public`/`supabase` (sinon bruit). Vérifier le `ignores`.
- Le step CI ne doit échouer QUE sur erreurs (pas sur warnings) — comportement eslint par défaut (pas de `--max-warnings 0`).
