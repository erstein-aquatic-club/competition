# Infra eslint (react-hooks/rules-of-hooks en CI) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans pour implémenter tâche par tâche.

**Goal:** Ajouter un garde-fou eslint minimal — `react-hooks/rules-of-hooks` en ERREUR — lancé en CI avant le build, pour empêcher la réintroduction des bugs React #310.

**Architecture:** eslint 9 flat config minimal (parser typescript-eslint sans type-aware + plugin react-hooks), script `npm run lint`, étape lint dans `pages.yml` avant le build. Design : `docs/plans/2026-05-30-eslint-react-hooks-design.md`.

**Tech Stack:** eslint@9, @eslint/js, typescript-eslint@8, eslint-plugin-react-hooks@5, globals. Node 24.

**Vérifs :** `npm run lint` ; `npx tsc --noEmit` ; `npm run build`. (Pas de test:rls, pas de node:test/vitest impactés.)

---

## Task 1 : Installer eslint + config minimale + script

**Files:**
- Modify: `package.json` (devDependencies + script `lint`)
- Create: `eslint.config.js` (racine)

**Step 1 — Installer les deps** :
```bash
npm install -D eslint@^9 @eslint/js typescript-eslint@^8 eslint-plugin-react-hooks@^5 globals
```
(Vérifier les versions résolues : `node -e "console.log(require('eslint-plugin-react-hooks/package.json').version)"` → doit être ≥ 5.2 pour le flat-config.)

**Step 2 — Créer `eslint.config.js`** :
```js
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**", "dev-dist/**", "node_modules/**", "public/**",
      "supabase/**", "**/*.config.js", "**/*.config.ts", "attached_assets/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
```
(Si `eslint-plugin-react-hooks` n'expose pas correctement le plugin en flat, adapter l'import — certains exposent `reactHooks.configs['recommended-latest']`. Mais le bloc manuel ci-dessus avec `plugins`+`rules` est le plus robuste.)

**Step 3 — Ajouter le script** dans `package.json` :
```json
"lint": "eslint ."
```

**Step 4 — Vérifier que le lint passe vert aujourd'hui** :
Run: `npm run lint`
Expected: **exit 0**. 0 erreur `rules-of-hooks` (les hooks sont propres). Des warnings `react-hooks/exhaustive-deps` peuvent apparaître (tolérés). Si une ERREUR rules-of-hooks apparaît, c'est un vrai #310 à corriger (le signaler — ne pas désactiver la règle).

**Step 5 — PROUVER que la garde attrape un #310** (équivalent « watch it fail ») :
- Introduire temporairement, dans un composant simple (ex. en tête d'un `src/components/...tsx`), un hook après un early return, p.ex. :
  ```tsx
  if (someProp == null) return null;
  const x = useMemo(() => 1, []); // viole rules-of-hooks
  ```
- Run: `npm run lint` → **doit échouer** avec `react-hooks/rules-of-hooks`.
- **Retirer** la violation. Re-run `npm run lint` → vert.
(Ne PAS commiter la violation. C'est juste la preuve manuelle que le garde-fou fonctionne.)

**Step 6 — Commit** :
```bash
git add package.json package-lock.json eslint.config.js
git commit -m "build(§350): eslint minimal + react-hooks/rules-of-hooks (error)"
```

---

## Task 2 : Brancher le lint en CI (pages.yml, avant le build)

**Files:**
- Modify: `.github/workflows/pages.yml`

**Step 1 — Lire le workflow** pour repérer l'étape `npm ci`/install et l'étape `npm run build`.

**Step 2 — Insérer une étape lint** entre l'install des deps et le build :
```yaml
      - name: Lint (react-hooks)
        run: npm run lint
```
(Placer APRÈS `npm ci`/`npm install` et AVANT `npm run build`. Un échec `rules-of-hooks` arrête le job → pas de déploiement.)

**Step 3 — Vérifier la cohérence YAML** (indentation, position dans le bon job).

**Step 4 — Commit** :
```bash
git add .github/workflows/pages.yml
git commit -m "ci(§350): lint react-hooks bloquant avant le build (garde anti-#310)"
```

---

## Task 3 : Vérif + doc

**Steps :** `npm run lint` (vert), `npx tsc --noEmit` (0), `npm run build` (OK). Mettre à jour `docs/implementation-log.md` (§350), `docs/ROADMAP.md` (tête), `docs/FEATURES_STATUS.md` (tête), `CLAUDE.md` (Dernier §). `eslint.config.js` est un nouveau fichier racine → mention dans `docs/claude/files-map.md` si pertinent (config). Commit.

---

## Risques / pièges

- **Compat flat-config** eslint 9 × react-hooks v5 : si le plugin ne s'importe pas proprement, vérifier sa version (≥5.2) et adapter l'import. Tester `npm run lint` tôt.
- **Bruit** : si le lint remonte des fichiers hors `src` (config, supabase), ajuster `ignores`.
- **CI bloque sur warnings** : NE PAS ajouter `--max-warnings 0` (sinon les `exhaustive-deps` existants bloqueraient). Seules les erreurs (rules-of-hooks) doivent faire échouer.
- **Le déploiement deviendra dépendant du lint** : un vrai #310 bloquera le déploiement (c'est le but), mais vérifier que le lint est rapide (pas de type-aware) pour ne pas ralentir la CI.
