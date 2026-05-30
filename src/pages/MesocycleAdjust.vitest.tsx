// Tests UI (vitest jsdom) de l'ecran coach MesocycleAdjust (tache B6).
//
// Deux familles :
//  - helpers PURS exportes (nextMonday / defaultWeekdays / pivotStateOf /
//    formatFactorDelta) : deterministes, sans rendu.
//  - composant : pivot par defaut, preset Allegement, Apercu desactive quand il
//    ne reste aucune semaine, banniere rouge sur pivot passe.
//
// Mocks : wouter (route athleteId=18 + navigate espionne) et @/lib/api (toutes
// les fonctions importees par la page). getCurrentMesocyclePhaseInfo est PUR :
// on le re-implemente dans le mock via le vrai cycleAtWeek (aucun I/O) pour que
// la phase et les semaines restantes soient calculees pour de vrai.
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// jsdom n'implemente pas ResizeObserver, requis par le Slider Radix (charge).
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

import { cycleAtWeek } from "@/lib/strength/mesocycleEngine";
import type {
  StrengthPeriodizationTemplate,
  PeriodizationCycle,
} from "@/lib/api/types";
import type {
  DistanceProfile,
  StrokeSignature,
} from "@/lib/strength/mesocycleEngine.types";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const navigateSpy = vi.fn();
vi.mock("wouter", () => ({
  useRoute: () => [true, { athleteId: "18" }],
  useLocation: () => ["/strength/mesocycle-adjust/18", navigateSpy],
}));

// Rôle de l'utilisateur courant : pilotable par test via setMockRole.
// MesocycleAdjust est un écran COACH → un nageur doit être refusé (C1).
let mockRole: string | null = "coach";
function setMockRole(r: string | null) {
  mockRole = r;
}
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) =>
    selector({ role: mockRole }),
}));

// Le meso renvoye par getActiveMesocycle : pilotable par test via setMockMeso.
let mockMeso: Record<string, unknown> | null = null;
function setMockMeso(m: Record<string, unknown> | null) {
  mockMeso = m;
}

// Taxonomie minimale REELLE pour que composeTemplate produise un template valide.
// Arc de phases simple : 3 prepa_generale -> 2 force_max -> 1 puissance (6 sem).
const PHASES = [
  { cycle: "prepa_generale" as PeriodizationCycle, min_weeks: 1, nominal_weeks: 3, max_weeks: 4 },
  { cycle: "force_max" as PeriodizationCycle, min_weeks: 1, nominal_weeks: 2, max_weeks: 3 },
  { cycle: "puissance" as PeriodizationCycle, min_weeks: 1, nominal_weeks: 1, max_weeks: 2 },
];

const FREESTYLE_SIGNATURE: StrokeSignature = {
  stroke_key: "freestyle",
  label: "Crawl",
  mult: {
    lower_strength: 1,
    lower_power: 1,
    upper_strength: 1,
    upper_power: 1,
    mobility: 1,
    core: 1,
  },
  forcedFocus: ["upper_strength", "upper_power"],
};

const PROFILE_50_SEASON: DistanceProfile = {
  distance_key: "50",
  kind: "season",
  label: "50 m",
  emphasis: {
    lower_strength: 0.6,
    lower_power: 0.7,
    upper_strength: 0.8,
    upper_power: 0.9,
    mobility: 0.4,
    core: 0.5,
  },
  structure: {
    phases: PHASES,
    bucket_emphasis: {},
    forced_focus: [],
  },
  min_week_count: 3,
  max_week_count: 9,
};

vi.mock("@/lib/api", () => ({
  getActiveMesocycle: vi.fn(async () => mockMeso),
  getStrokeSignatures: vi.fn(async () => [FREESTYLE_SIGNATURE]),
  getDistanceProfiles: vi.fn(async () => [PROFILE_50_SEASON]),
  getLatestAssessment: vi.fn(async () => ({ updated_at: "2026-05-01T10:00:00Z" })),
  getAthletes: vi.fn(async () => [{ id: 18, display_name: "Nageur Test" }]),
  // PUR (aucun I/O dans l'original) : on reproduit la vraie logique avec le vrai
  // cycleAtWeek pour que weeksRemaining / phaseKey soient calcules reellement.
  getCurrentMesocyclePhaseInfo: (args: {
    startMonday: string;
    totalWeeks: number;
    template: StrengthPeriodizationTemplate;
    pivotMonday: string;
  }) => {
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const utc = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
    const diff = Math.floor(
      (utc(args.pivotMonday) - utc(args.startMonday)) / MS_PER_WEEK,
    );
    const weekIndex = Math.min(Math.max(diff, 0), args.totalWeeks);
    const weeksRemaining = Math.max(0, args.totalWeeks - weekIndex);
    const phaseKey =
      weeksRemaining > 0
        ? cycleAtWeek(args.template, args.totalWeeks, weekIndex)
        : null;
    return { weekIndex, weeksRemaining, phaseKey };
  },
}));

// Importe la page APRES les mocks (vi.mock est hoiste, mais l'import explicite
// apres clarifie l'ordre de lecture).
import MesocycleAdjust, {
  nextMonday,
  defaultWeekdays,
  pivotStateOf,
  formatFactorDelta,
} from "@/pages/MesocycleAdjust";

// Construit un meso avec un generated_at donne (controle weeksRemaining).
function makeMeso(generatedAt: string, targetWeekCount = 6) {
  return {
    id: "meso-1",
    athlete_id: 18,
    assessment_id: "assess-1",
    template_id: "freestyle_50_season",
    event_group: "freestyle_50",
    kind: "season",
    target_week_count: targetWeekCount,
    sessions_per_week: 4,
    status: "active",
    bucket_priorities: null,
    engine_version: "1.0.0",
    generated_at: generatedAt,
    generated_by: null,
    created_at: generatedAt,
    updated_at: generatedAt,
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MesocycleAdjust />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  navigateSpy.mockClear();
  setMockMeso(null);
  setMockRole("coach");
  cleanup();
});

// ── Helpers purs ───────────────────────────────────────────────────────────────

describe("MesocycleAdjust — helpers purs", () => {
  it("nextMonday renvoie le lundi STRICTEMENT suivant", () => {
    // 2026-06-08 est un lundi.
    const fromMonday = new Date("2026-06-08T12:00:00");
    expect(fromMonday.getDay()).toBe(1); // sanity: bien un lundi
    expect(nextMonday(fromMonday)).toBe("2026-06-15");

    // Mercredi 2026-06-10 -> lundi a venir 2026-06-15.
    const fromMidweek = new Date("2026-06-10T12:00:00");
    expect(nextMonday(fromMidweek)).toBe("2026-06-15");
  });

  it("defaultWeekdays renvoie les presets attendus et jamais samedi(5)", () => {
    expect(defaultWeekdays(3)).toEqual([0, 2, 4]);
    expect(defaultWeekdays(4)).toEqual([0, 1, 3, 4]);
    expect(defaultWeekdays(2)).toEqual([0, 3]);
    expect(defaultWeekdays(5)).toEqual([0, 1, 2, 3, 4]);
    for (const n of [2, 3, 4, 5, 6, 7]) {
      expect(defaultWeekdays(n)).not.toContain(5);
    }
  });

  it("pivotStateOf classe passe / courant / futur", () => {
    expect(pivotStateOf("2026-06-01", "2026-06-08")).toBe("past");
    expect(pivotStateOf("2026-06-08", "2026-06-08")).toBe("current");
    expect(pivotStateOf("2026-06-15", "2026-06-08")).toBe("future");
  });

  it("formatFactorDelta formate le delta avec le bon signe", () => {
    expect(formatFactorDelta(0.8, "series")).toContain("−20");
    expect(formatFactorDelta(1.0, "series")).toContain("0 %");
    expect(formatFactorDelta(1.15, "%1RM")).toContain("+15");
  });
});

// ── Composant ──────────────────────────────────────────────────────────────────

describe("MesocycleAdjust — composant", () => {
  it("refuse l'accès à un nageur (écran réservé au coach) — C1", async () => {
    setMockRole("athlete");
    setMockMeso(makeMeso(new Date().toISOString()));
    renderPage();

    // Le garde-fou de rôle s'affiche…
    await screen.findByText(/réservé aux entraîneurs/i);
    // …et le formulaire d'ajustement n'est JAMAIS rendu (pas de champ date pivot).
    expect(screen.queryByDisplayValue(nextMonday())).toBeNull();
  });

  it("change de séances/sem → resynchronise les jours cochés — C4", async () => {
    // meso = 4 séances/sem → 4 jours cochés au départ (defaultWeekdays(4)).
    setMockMeso(makeMeso(new Date().toISOString()));
    renderPage();
    await screen.findByDisplayValue(nextMonday());

    const checkedCount = () =>
      screen
        .getAllByRole("checkbox")
        .filter((el) => el.getAttribute("aria-checked") === "true").length;
    expect(checkedCount()).toBe(4);

    // Passer à 5 séances doit recocher defaultWeekdays(5) = [Lun..Ven] = 5 jours.
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    await waitFor(() => expect(checkedCount()).toBe(5));
  });

  it("pivot par defaut = lundi suivant (meso recent)", async () => {
    // generated_at = aujourd'hui -> weeksRemaining > 0, formulaire visible.
    setMockMeso(makeMeso(new Date().toISOString()));
    renderPage();

    // Le champ date apparait apres resolution des queries.
    const dateInput = (await screen.findByDisplayValue(
      nextMonday(),
    )) as HTMLInputElement;
    expect(dateInput.type).toBe("date");
    expect(dateInput.value).toBe(nextMonday());
  });

  it("preset Allegement applique volume 0.8 / intensite 0.9", async () => {
    setMockMeso(makeMeso(new Date().toISOString()));
    renderPage();

    // Attend le formulaire (presence du bouton Allegement).
    const allegement = await screen.findByRole("button", { name: "Allègement" });
    fireEvent.click(allegement);

    // Les deltas rendus refletent -20 % (volume x0.80) et -10 % (intensite x0.90).
    await waitFor(() => {
      expect(screen.getByText(/−20 %.*×0\.80/)).toBeTruthy();
      expect(screen.getByText(/−10 %.*×0\.90/)).toBeTruthy();
    });
  });

  it("Apercu desactive + info quand il ne reste aucune semaine", async () => {
    // generated_at tres dans le passe + 2 semaines -> le pivot lundi-prochain est
    // au-dela de la fin du meso -> weeksRemaining 0 (deterministe).
    setMockMeso(makeMeso("2020-01-01T00:00:00Z", 2));
    renderPage();

    // L'info "aucune semaine a recalculer" prouve que le formulaire est charge.
    await screen.findByText(/aucune semaine à recalculer/i);

    const apercu = screen.getByRole("button", { name: /Aperçu/i });
    expect(apercu).toHaveProperty("disabled", true);
  });

  it("banniere rouge + Apercu desactive quand le pivot est dans le passe", async () => {
    setMockMeso(makeMeso(new Date().toISOString()));
    renderPage();

    const dateInput = (await screen.findByDisplayValue(
      nextMonday(),
    )) as HTMLInputElement;

    // 2020-01-06 est un lundi clairement passe.
    fireEvent.change(dateInput, { target: { value: "2020-01-06" } });

    await screen.findByText(/doit être dans le futur/i);

    const apercu = screen.getByRole("button", { name: /Aperçu/i });
    expect(apercu).toHaveProperty("disabled", true);
  });
});
