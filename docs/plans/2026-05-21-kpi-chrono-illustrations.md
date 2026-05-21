# §295 — Chrono temps de vol + illustrations SVG animées KPI — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer la saisie texte manuelle des temps de vol du KPI détente verticale par un module chrono tactile intégré (Start/Stop), et le placeholder « Démonstration à venir » des 5 protocoles KPI par des illustrations SVG inline animées.

**Architecture:** Composant `KpiStopwatch` autonome (state machine via `useState`, mesure via `performance.now`), intégré dans `VerticalJumpInputs` avec fallback texte révélable. 5 composants SVG inline animés via CSS keyframes (style monochrome `stroke-current`), routés par un dispatcher `KpiAnimatedIllustration` que `KpiGifPanel` consomme quand `gifUrl === null`. Aucune librairie d'animation, aucune migration DB.

**Tech Stack:** React 19 + TS + Tailwind 4 + shadcn/ui (`Input`, `Button`, `Label`), Vitest pour les tests, CSS keyframes natifs pour les animations.

**Design source:** `docs/plans/2026-05-21-kpi-chrono-illustrations-design.md`

---

## Pré-requis

- Auto-mode actif : ne pas pauser entre tasks, faire la reasonable call.
- `/frontend-design` skill **OBLIGATOIRE** pour toute pièce UI (rappel CLAUDE.md user instructions). Invocation prévue au début de Task 1 (chrono UI) et de Task 5 (illustrations SVG).
- Tous commits via `git commit -m` avec heredoc, Co-Authored-By Claude, sans `--no-verify`.

---

## Task 1: `KpiStopwatch` — composant chrono + tests state machine

**Files:**
- Create: `src/components/strength/kpi/KpiStopwatch.tsx`
- Test: `src/components/strength/kpi/__tests__/KpiStopwatch.test.tsx`

**Spec:**
- Props : `{ index: number; value: string | null; onStop: (seconds: string) => void; onReset: () => void; }`
- États internes : `idle | running | stopped` (déduits de `value`, pas de useState séparé pour le statut).
- Si `value === null` → afficher bouton « Démarrer essai N+1 » (idle).
- Si `running` (interne) → afficher bouton « ⏹ Arrêter » + readout live (rAF).
- Si `value !== null` → afficher la valeur + ↺ Refaire (stopped).
- `tStart = performance.now()` au Démarrer ; `tEnd = performance.now()` au Arrêter ; pousse `((tEnd - tStart) / 1000).toFixed(2)` via `onStop`.
- Format readout : 2 décimales, monospace, gros (`text-4xl tabular-nums`).
- Haptique : `navigator.vibrate?.(50)` au start, `navigator.vibrate?.([0, 50, 50, 50])` au stop.
- Cleanup `cancelAnimationFrame` en useEffect cleanup.
- `aria-live="polite"` sur le readout.

**Step 1: Spawn /frontend-design pour le design visuel + state machine du chrono**

Invocation : `Skill frontend-design:frontend-design` avec args expliquant le besoin (bouton h-32 plein largeur, readout 2 décimales, transitions douces, fallback haptic). On récupère la maquette/code-target.

**Step 2: Écrire les tests state machine d'abord (TDD)**

`src/components/strength/kpi/__tests__/KpiStopwatch.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KpiStopwatch, formatStopwatchSeconds } from '../KpiStopwatch';

describe('formatStopwatchSeconds', () => {
  it('renvoie 2 décimales pour une valeur entière', () => {
    expect(formatStopwatchSeconds(0.5)).toBe('0.50');
  });
  it('arrondit correctement à 2 décimales', () => {
    expect(formatStopwatchSeconds(0.523)).toBe('0.52');
    expect(formatStopwatchSeconds(0.525)).toBe('0.53');
  });
  it('clamp à 0 si négatif', () => {
    expect(formatStopwatchSeconds(-0.1)).toBe('0.00');
  });
});

describe('KpiStopwatch', () => {
  let nowSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    nowSpy = vi.spyOn(performance, 'now').mockReturnValue(0);
  });
  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('affiche le bouton "Démarrer" en idle (value null)', () => {
    render(<KpiStopwatch index={0} value={null} onStop={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByRole('button', { name: /démarrer/i })).toBeInTheDocument();
  });

  it('Démarrer → Arrêter calcule le temps via performance.now', async () => {
    const onStop = vi.fn();
    const user = userEvent.setup();
    render(<KpiStopwatch index={0} value={null} onStop={onStop} onReset={vi.fn()} />);

    nowSpy.mockReturnValue(1000);
    await user.click(screen.getByRole('button', { name: /démarrer/i }));

    nowSpy.mockReturnValue(1523);
    await user.click(screen.getByRole('button', { name: /arrêter/i }));

    expect(onStop).toHaveBeenCalledWith('0.52');
  });

  it('en stopped (value="0.50"), affiche valeur + bouton Refaire', () => {
    const onReset = vi.fn();
    render(<KpiStopwatch index={0} value="0.50" onStop={vi.fn()} onReset={onReset} />);
    expect(screen.getByText(/0\.50/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refaire/i })).toBeInTheDocument();
  });

  it('clic Refaire appelle onReset', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<KpiStopwatch index={0} value="0.50" onStop={vi.fn()} onReset={onReset} />);
    await user.click(screen.getByRole('button', { name: /refaire/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
```

**Step 3: Run tests, expected FAIL (composant n'existe pas)**

Run: `npx vitest run src/components/strength/kpi/__tests__/KpiStopwatch.test.tsx`
Expected: FAIL `Cannot find module '../KpiStopwatch'`

**Step 4: Implémenter `KpiStopwatch.tsx` (utilise le design retourné par frontend-design en Step 1)**

Squelette :

```tsx
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

export function formatStopwatchSeconds(s: number): string {
  return Math.max(0, s).toFixed(2);
}

export interface KpiStopwatchProps {
  index: number;
  value: string | null;
  onStop: (seconds: string) => void;
  onReset: () => void;
}

export function KpiStopwatch({ index, value, onStop, onReset }: KpiStopwatchProps) {
  const [running, setRunning] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const tStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const tick = () => {
    if (tStartRef.current == null) return;
    setLiveSeconds((performance.now() - tStartRef.current) / 1000);
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = () => {
    tStartRef.current = performance.now();
    setLiveSeconds(0);
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
    navigator.vibrate?.(50);
  };

  const stop = () => {
    if (tStartRef.current == null) return;
    const elapsed = (performance.now() - tStartRef.current) / 1000;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setRunning(false);
    tStartRef.current = null;
    onStop(formatStopwatchSeconds(elapsed));
    navigator.vibrate?.([0, 50, 50, 50]);
  };

  // STOPPED state — value posed
  if (value != null && !running) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 px-4 py-5 text-center">
        <div aria-live="polite" className="font-mono text-4xl font-black tabular-nums text-primary">
          {value}
          <span className="ml-1 text-lg font-medium text-muted-foreground">s</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="mt-2"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Refaire
        </Button>
      </div>
    );
  }

  // RUNNING state
  if (running) {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label="Arrêter le chronomètre"
        className="w-full rounded-2xl border-2 border-rose-500/60 bg-rose-50 px-4 py-6 text-center transition-colors hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40"
      >
        <div aria-live="polite" className="font-mono text-5xl font-black tabular-nums text-rose-600 dark:text-rose-300">
          {formatStopwatchSeconds(liveSeconds)}
          <span className="ml-1 text-lg font-medium text-muted-foreground">s</span>
        </div>
        <div className="mt-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">
          <Square className="h-4 w-4 fill-current" /> Arrêter
        </div>
      </button>
    );
  }

  // IDLE state
  return (
    <button
      type="button"
      onClick={start}
      aria-label={`Démarrer le chronomètre — essai ${index + 1}`}
      className={cn(
        'w-full rounded-2xl border-2 border-dashed border-primary/40 bg-card px-4 py-6',
        'text-center transition-colors hover:bg-primary/5'
      )}
    >
      <div className="font-mono text-4xl font-black tabular-nums text-muted-foreground">
        0.00<span className="ml-1 text-lg">s</span>
      </div>
      <div className="mt-3 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary">
        <Play className="h-4 w-4 fill-current" /> Démarrer essai {index + 1}
      </div>
    </button>
  );
}
```

**Step 5: Run tests, expected PASS**

Run: `npx vitest run src/components/strength/kpi/__tests__/KpiStopwatch.test.tsx`
Expected: PASS (5 tests)

**Step 6: Commit**

```bash
git add src/components/strength/kpi/KpiStopwatch.tsx src/components/strength/kpi/__tests__/KpiStopwatch.test.tsx
git commit -m "feat(§295): KpiStopwatch — chrono temps de vol intégré (state machine idle/running/stopped)"
```

---

## Task 2: Intégrer `KpiStopwatch` dans `VerticalJumpInputs` + fallback texte révélable

**Files:**
- Modify: `src/components/strength/kpi/VerticalJumpInputs.tsx`
- Test: `src/components/strength/kpi/__tests__/VerticalJumpInputs.test.tsx`

**Spec:**
- État local `manualMode: boolean` (défaut false).
- Si `manualMode === false` → affiche 3 `KpiStopwatch` empilés (mode card) au-dessus du recap puissance.
- Lien sticky « Saisir manuellement → » qui bascule en mode texte (les 3 `<Input>` actuels).
- Si `manualMode === true` → affiche les 3 inputs + lien « ⏱ Revenir au chrono ».
- Au reset (↺) d'un essai chrono, appelle `onChangeFlightTime(i, '')`.
- Le **poids** reste un `<Input>` standard dans les 2 modes — non chronométrable.

**Step 1: Écrire les tests fallback toggle**

```tsx
// src/components/strength/kpi/__tests__/VerticalJumpInputs.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerticalJumpInputs } from '../VerticalJumpInputs';

describe('VerticalJumpInputs — fallback toggle', () => {
  const noopProps = {
    flightTimesRaw: ['', '', ''],
    weightRaw: '',
    onChangeFlightTime: vi.fn(),
    onChangeWeight: vi.fn(),
  };

  it('rend 3 chronos par défaut (pas les inputs flight time)', () => {
    render(<VerticalJumpInputs {...noopProps} />);
    expect(screen.getAllByRole('button', { name: /démarrer.*essai/i })).toHaveLength(3);
    expect(screen.queryByLabelText(/temps de vol — essai 1 en secondes/i)).not.toBeInTheDocument();
  });

  it('clic "Saisir manuellement" révèle les 3 inputs texte', async () => {
    const user = userEvent.setup();
    render(<VerticalJumpInputs {...noopProps} />);
    await user.click(screen.getByRole('button', { name: /saisir manuellement/i }));
    expect(screen.getByLabelText(/temps de vol — essai 1 en secondes/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /démarrer.*essai/i })).not.toBeInTheDocument();
  });
});
```

**Step 2: Run tests → FAIL (composant pas encore refactor)**

Run: `npx vitest run src/components/strength/kpi/__tests__/VerticalJumpInputs.test.tsx`
Expected: FAIL

**Step 3: Refactor `VerticalJumpInputs.tsx`**

Ajouts :
- Import `KpiStopwatch` + `Button`.
- État local `const [manualMode, setManualMode] = useState(false)`.
- Bloc « Temps de vol » remplace le grid d'inputs par :
  - Si `!manualMode` : une pile verticale de 3 `KpiStopwatch`, chacun avec `value={flightTimesRaw[i] || null}`, `onStop={(s) => onChangeFlightTime(i, s)}`, `onReset={() => onChangeFlightTime(i, '')}`.
  - Si `manualMode` : le grid existant.
- Sous le bloc : `<Button variant="link" size="sm" onClick={() => setManualMode(!manualMode)}>`.

**Step 4: Run les tests Vertical + KpiStopwatch + npm test (smoke)**

Run: `npx vitest run src/components/strength/kpi`
Expected: PASS

Run: `npm test 2>&1 | tail -10`
Expected: 886+ tests verts (compte exact +5-7 tests selon les ajouts)

**Step 5: Commit**

```bash
git add src/components/strength/kpi/VerticalJumpInputs.tsx src/components/strength/kpi/__tests__/VerticalJumpInputs.test.tsx
git commit -m "feat(§295): VerticalJumpInputs — chrono intégré + fallback saisie texte révélable"
```

---

## Task 3: `KpiAnimatedIllustration` dispatcher + 5 illustrations SVG (via /frontend-design)

**Files:**
- Create: `src/components/strength/kpi/KpiAnimatedIllustration.tsx`
- Create: `src/components/strength/kpi/illustrations/VerticalJumpAnim.tsx`
- Create: `src/components/strength/kpi/illustrations/BroadJumpAnim.tsx`
- Create: `src/components/strength/kpi/illustrations/ImtpAnim.tsx`
- Create: `src/components/strength/kpi/illustrations/WeightedPullupAnim.tsx`
- Create: `src/components/strength/kpi/illustrations/MedballThrowAnim.tsx`

**Spec :**
- Chaque illustration = composant React qui renvoie un `<svg viewBox="0 0 320 180" stroke="currentColor" fill="none">` avec un `<style>` keyframes inline préfixé par un id unique pour éviter les collisions globales (ex `@keyframes vj-jump-{instanceId}` ou via classes namespacées `.vj-anim`).
- Trait épais ~2-3px, traits droits/courbes simples, silhouette stylisée (cercle tête + lignes corps).
- Anim en boucle infinie, cycle selon le KPI (2.0-2.5s).
- Pas de remplissage couleur (sauf points cardinaux ground/ball éventuels).
- Composant `KpiAnimatedIllustration` : `switch (kpiKey)` → renvoie le bon sous-composant + container `aspect-video rounded-2xl border bg-muted/30`.

**Step 1: Invoke /frontend-design avec brief 5 anims**

Brief : 5 animations SVG inline, monochrome stroke-current, ratio 16:9, cycles 2-2.5s, silhouette stylisée. Pour chaque KPI : décrire le mouvement (cf. design §5.2), retourner le SVG + keyframes.

**Step 2: Implémenter `KpiAnimatedIllustration.tsx` (dispatcher minimal)**

```tsx
import type { StrengthKpiKey } from '@/lib/api/types';
import { VerticalJumpAnim } from './illustrations/VerticalJumpAnim';
import { BroadJumpAnim } from './illustrations/BroadJumpAnim';
import { ImtpAnim } from './illustrations/ImtpAnim';
import { WeightedPullupAnim } from './illustrations/WeightedPullupAnim';
import { MedballThrowAnim } from './illustrations/MedballThrowAnim';

export function KpiAnimatedIllustration({
  kpiKey,
  label,
}: {
  kpiKey: StrengthKpiKey;
  label: string;
}) {
  const Anim = (() => {
    switch (kpiKey) {
      case 'vertical_jump': return VerticalJumpAnim;
      case 'broad_jump': return BroadJumpAnim;
      case 'imtp': return ImtpAnim;
      case 'weighted_pullup': return WeightedPullupAnim;
      case 'medball_vertical_throw': return MedballThrowAnim;
    }
  })();

  return (
    <div
      className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border bg-muted/30 text-foreground/70"
      role="img"
      aria-label={`Démonstration animée : ${label}`}
    >
      <Anim />
    </div>
  );
}
```

**Step 3: Implémenter les 5 fichiers d'animation (sortie de /frontend-design)**

Chaque fichier exporte un composant React simple :

```tsx
// VerticalJumpAnim.tsx (exemple — détails fournis par /frontend-design)
export function VerticalJumpAnim() {
  return (
    <svg viewBox="0 0 320 180" stroke="currentColor" fill="none" className="h-full w-full">
      <style>{`
        @keyframes vj-jump {
          0%, 20%   { transform: translateY(0); }
          30%       { transform: translateY(8px); }   /* flexion */
          50%       { transform: translateY(-40px); } /* apex */
          70%       { transform: translateY(0); }
          100%      { transform: translateY(0); }
        }
        .vj-body { animation: vj-jump 2.5s ease-in-out infinite; transform-origin: center bottom; }
      `}</style>
      <line x1="40" y1="160" x2="280" y2="160" strokeWidth="2" />
      <g className="vj-body">
        <circle cx="160" cy="60" r="12" strokeWidth="2.5" />
        <path d="M160 72 L160 120 M140 100 L180 100 M160 120 L145 150 M160 120 L175 150" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
```

Les 4 autres suivent le même squelette avec leur propre `@keyframes`.

**Step 4: Vérifier types + build**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: exit 0

Run: `npm run build 2>&1 | tail -10`
Expected: ✓ built

**Step 5: Commit**

```bash
git add src/components/strength/kpi/KpiAnimatedIllustration.tsx src/components/strength/kpi/illustrations/
git commit -m "feat(§295): 5 illustrations SVG animées pour les protocoles KPI"
```

---

## Task 4: Brancher `KpiAnimatedIllustration` dans `KpiGifPanel`

**Files:**
- Modify: `src/components/strength/kpi/KpiGifPanel.tsx`
- Modify: `src/components/strength/kpi/KpiStepCard.tsx` (passer `kpiKey` au panel)
- Test: `src/components/strength/kpi/__tests__/KpiGifPanel.test.tsx`

**Step 1: Écrire les tests KpiGifPanel**

```tsx
// __tests__/KpiGifPanel.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiGifPanel } from '../KpiGifPanel';

describe('KpiGifPanel', () => {
  it('rend une image si gifUrl est fourni', () => {
    render(<KpiGifPanel gifUrl="https://example.com/demo.gif" kpiKey="vertical_jump" label="Détente" />);
    expect(screen.getByRole('img', { name: /détente/i })).toHaveAttribute('src', 'https://example.com/demo.gif');
  });

  it('rend une illustration animée si gifUrl est null', () => {
    render(<KpiGifPanel gifUrl={null} kpiKey="vertical_jump" label="Détente" />);
    // role="img" + aria-label de KpiAnimatedIllustration
    expect(screen.getByLabelText(/démonstration animée.*détente/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests → FAIL (signature pas encore mise à jour)**

Run: `npx vitest run src/components/strength/kpi/__tests__/KpiGifPanel.test.tsx`
Expected: FAIL

**Step 3: Refactor `KpiGifPanel.tsx`**

```tsx
import type { StrengthKpiKey } from '@/lib/api/types';
import { KpiAnimatedIllustration } from './KpiAnimatedIllustration';

export function KpiGifPanel({
  gifUrl,
  kpiKey,
  label,
}: {
  gifUrl: string | null;
  kpiKey: StrengthKpiKey;
  label: string;
}) {
  if (gifUrl) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-muted">
        <img
          src={gifUrl}
          alt={`Démonstration : ${label}`}
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  return <KpiAnimatedIllustration kpiKey={kpiKey} label={label} />;
}
```

**Step 4: Mettre à jour `KpiStepCard.tsx` pour passer `kpiKey`**

Ligne 60 : `<KpiGifPanel gifUrl={protocol.gifUrl} kpiKey={protocol.key} label={protocol.label} />`

**Step 5: Run tests**

Run: `npx vitest run src/components/strength/kpi`
Expected: PASS (KpiGifPanel + autres)

**Step 6: tsc + build smoke**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: exit 0 + ✓ built

**Step 7: Commit**

```bash
git add src/components/strength/kpi/KpiGifPanel.tsx src/components/strength/kpi/KpiStepCard.tsx src/components/strength/kpi/__tests__/KpiGifPanel.test.tsx
git commit -m "feat(§295): KpiGifPanel rend l'illustration animée quand gifUrl null"
```

---

## Task 5: Smoke check global + doc

**Files:**
- Modify: `docs/implementation-log.md` (entrée §295)
- Modify: `docs/ROADMAP.md` (lead « Dernière mise à jour »)
- Modify: `CLAUDE.md` (Dernier § livré)
- Modify: `docs/claude/files-map.md` (nouveaux fichiers ≥150 LOC)

**Step 1: Smoke complet**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -10`
Expected: exit 0 + tests verts (886 + ~12 ajoutés)

Run: `npm run build 2>&1 | tail -10`
Expected: ✓ built

**Step 2: Mettre à jour la doc**

- `implementation-log.md` : ajouter en tête une entrée `## §295 — Chrono KPI + illustrations SVG animées` (suivre le format §294, avec sections Changements / Fichiers / Tests / Décisions / Limites).
- `ROADMAP.md` : lead « Dernière mise à jour » → §295 résumé court.
- `CLAUDE.md` ligne 78 : « Dernier § livré » → §295.
- `files-map.md` : ajouter lignes pour `KpiStopwatch.tsx` (~150 l estimées), `KpiAnimatedIllustration.tsx` (dispatcher court), et la table `illustrations/` (5 fichiers SVG).

**Step 3: Commit final**

```bash
git add CLAUDE.md docs/ROADMAP.md docs/implementation-log.md docs/claude/files-map.md
git commit -m "docs(§295): consigne — chrono KPI + illustrations SVG animées"
```

**Step 4: Push**

```bash
git push origin main 2>&1 | tail -5
```

---

## Vérifications post-impl

| Check | Attendu |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 886+ verts (compte les nouveaux tests Vitest) |
| `npm run build` | ✓ built |
| `npm run test:rls` | non requis (rien de RLS touché) |
| Manuel : visiter `/strength/kpi-wizard` étape Détente | Chrono visible, Start/Stop fonctionne, valeurs poussées dans `flightTimesRaw[]` |
| Manuel : toutes les étapes KPI | Illustration animée visible à la place du placeholder |

## Limites / hors scope

- **Pas de tests des animations SVG** — purement visuel, validation manuelle à la review.
- **Pas de migration `gifUrl`** — l'override binaire reste possible à tout moment (priorité au `gifUrl` non null).
- **Pas de capteur accéléromètre** — out of scope.
- **VerticalJumpInputs test** ne couvre pas la chaîne « stop chrono → recompute puissance » (déjà couverte indirectement par les tests de `jumpPower.ts`).
