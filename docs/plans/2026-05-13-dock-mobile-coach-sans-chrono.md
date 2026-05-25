# Dock mobile coach/admin — Chrono → Profil Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer l'item Chrono du dock mobile coach/admin par un raccourci Profil, sans toucher à la nav desktop.

**Architecture:** Ajouter `getMobileNavItemsForRole()` dans `navItems.ts` (réutilise `getNavItemsForRole`, swap l'item chrono par profil pour coach/admin). `AppLayout.tsx` utilise cette nouvelle fonction uniquement pour le dock mobile (`md:hidden`).

**Tech Stack:** React 19, TypeScript, Lucide React (icônes déjà importées), Vitest (tests Node natifs via `node:test`)

---

### Task 1: Tests pour `getMobileNavItemsForRole`

**Files:**
- Modify: `src/components/layout/__tests__/AppLayoutLogic.test.ts`

**Step 1: Ajouter les tests failing**

Ajouter à la fin du fichier :

```ts
import { getMobileNavItemsForRole } from "@/components/layout/navItems";

test("getMobileNavItemsForRole — coach : Profil présent, Chrono absent", () => {
  const items = getMobileNavItemsForRole("coach");
  const labels = items.map((item) => item.label);

  assert.equal(items.length, 6);
  assert.ok(labels.includes("Profil"), "Profil doit être dans le dock mobile");
  assert.ok(!labels.includes("Chrono"), "Chrono ne doit PAS être dans le dock mobile");
  assert.ok(labels.includes("Ma muscu"));
});

test("getMobileNavItemsForRole — admin : même comportement que coach", () => {
  const coachItems = getMobileNavItemsForRole("coach");
  const adminItems = getMobileNavItemsForRole("admin");
  assert.deepEqual(
    adminItems.map((i) => i.label),
    coachItems.map((i) => i.label)
  );
});

test("getMobileNavItemsForRole — athlete : identique à getNavItemsForRole", () => {
  const mobile = getMobileNavItemsForRole("athlete");
  const desktop = getNavItemsForRole("athlete");
  assert.deepEqual(
    mobile.map((i) => i.label),
    desktop.map((i) => i.label)
  );
});

test("getNavItemsForRole coach — Chrono toujours présent (desktop inchangé)", () => {
  const items = getNavItemsForRole("coach");
  const labels = items.map((i) => i.label);
  assert.ok(labels.includes("Chrono"), "Chrono reste dans la nav desktop");
});
```

**Step 2: Vérifier que les tests échouent**

```bash
cd /Users/francoiswagner/Antigravity/Project-EAC/competition
npm test -- --reporter=verbose 2>&1 | grep -A3 "getMobileNavItemsForRole"
```

Attendu : erreur d'import (`getMobileNavItemsForRole` not exported).

---

### Task 2: Implémenter `getMobileNavItemsForRole` dans `navItems.ts`

**Files:**
- Modify: `src/components/layout/navItems.ts`

**Step 1: Ajouter la fonction après `getNavItemsForRole`**

```ts
export const getMobileNavItemsForRole = (role: string | null): NavItem[] => {
  const normalizedRole = role ?? "athlete";
  if (normalizedRole === "coach" || normalizedRole === "admin") {
    return getNavItemsForRole(role).map((item) =>
      item.href === "/coach?section=chrono"
        ? { href: "/profile", icon: User, label: "Profil" }
        : item
    );
  }
  return getNavItemsForRole(role);
};
```

`User` est déjà importé ligne 1 de `navItems.ts`.

**Step 2: Vérifier que les tests passent**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(pass|fail|getMobileNavItemsForRole)"
```

Attendu : 4 nouveaux tests PASS, tests précédents toujours PASS.

**Step 3: Commit**

```bash
git add src/components/layout/navItems.ts src/components/layout/__tests__/AppLayoutLogic.test.ts
git commit -m "feat(§271): getMobileNavItemsForRole — dock mobile coach/admin chrono → profil"
```

---

### Task 3: Brancher la nav mobile dans `AppLayout.tsx`

**Files:**
- Modify: `src/components/layout/AppLayout.tsx:7` (import) et `:66` (usage)

**Step 1: Mettre à jour l'import ligne 7**

Remplacer :
```ts
import { getNavItemsForRole } from "@/components/layout/navItems";
```
Par :
```ts
import { getNavItemsForRole, getMobileNavItemsForRole } from "@/components/layout/navItems";
```

**Step 2: Ajouter la variable `mobileNavItems` après la ligne `const navItems = getNavItemsForRole(role);` (≈ ligne 66)**

```ts
const mobileNavItems = getMobileNavItemsForRole(role);
```

**Step 3: Remplacer `navItems.map(...)` dans le dock mobile uniquement**

Dans le bloc `<nav aria-label="Navigation principale" className={cn("md:hidden ...` (≈ ligne 198), remplacer :
```ts
{navItems.map((item) => {
```
Par :
```ts
{mobileNavItems.map((item) => {
```

Le header desktop (`hidden md:flex`) garde `navItems.map(...)` — ne pas y toucher.

**Step 4: Type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Attendu : aucune erreur.

**Step 5: Run tests complets**

```bash
npm test 2>&1 | tail -10
```

Attendu : tous les tests PASS.

**Step 6: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "feat(§271): dock mobile coach/admin — brancher getMobileNavItemsForRole"
```

---

### Task 4: Documentation

**Files:**
- Modify: `docs/implementation-log.md` (ajouter entrée §271)
- Modify: `docs/ROADMAP.md` (statut + dernière mise à jour)
- Modify: `docs/FEATURES_STATUS.md` (si feature nav mobile listée)
- Modify: `CLAUDE.md` (ligne "Dernier § livré")

**Step 1: Ajouter l'entrée §271 dans `docs/implementation-log.md`**

```markdown
## §271 — Dock mobile coach/admin : Chrono → Profil

**Date :** 2026-05-13
**Contexte :** La vue Chrono est trop dense pour mobile. Sur le dock mobile coach/admin, on remplace l'item Chrono par un raccourci Profil (aligné sur le rôle athlete). Chrono reste accessible sur la nav desktop.

**Changements :**
- `src/components/layout/navItems.ts` — ajout de `getMobileNavItemsForRole()` (swap chrono → profil pour coach/admin)
- `src/components/layout/AppLayout.tsx` — dock mobile utilise `getMobileNavItemsForRole`, desktop inchangé
- `src/components/layout/__tests__/AppLayoutLogic.test.ts` — 4 nouveaux tests (coach, admin, athlete, régression desktop)

**Décisions :** Deux fonctions distinctes (pas de flag `hideOnMobile`) pour garder les configs explicites et lisibles.
**Limites :** Aucune — périmètre intentionnellement étroit.
```

**Step 2: Mettre à jour `CLAUDE.md`**

Remplacer la ligne "Dernier § livré" :
```
Dernier § livré : **§271** — Dock mobile coach/admin : Chrono remplacé par Profil (navItems + AppLayout).
```

**Step 3: Commit final**

```bash
git add docs/implementation-log.md docs/ROADMAP.md CLAUDE.md
git commit -m "docs(§271): implementation-log, ROADMAP, CLAUDE.md"
```
