// §396 (audit muscu 2ᵉ passe, O7) — listes coach : un échec réseau s'affichait
// comme un état métier (« Aucun mésocycle actif », « Aucun plan… »), et
// « Aucun plan pour ce nageur » proposait même de créer un plan en doublon.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";

const { api } = vi.hoisted(() => {
  const fail = (): Promise<unknown> => Promise.reject(new Error("Failed to fetch"));
  const api = {
    listActiveMesocyclesWithAthletes: vi.fn(fail),
    getStrengthAttendanceData: vi.fn(fail),
    getTrainingPlans: vi.fn(fail),
    getTrainingPlanSessions: vi.fn(async () => []),
    getStrengthFolders: vi.fn(fail),
    getStrengthSessions: vi.fn(fail),
    getActiveMesocycle: vi.fn(fail),
    listMesocycles: vi.fn(async () => []),
  };
  return { api };
});
vi.mock("@/lib/api", () => ({
  ...api,
  applyTrainingPlan: vi.fn(async () => []),
  assignments_create: vi.fn(async () => []),
  createStrengthFolder: vi.fn(async () => []),
  createTrainingPlan: vi.fn(async () => []),
  deleteStrengthFolder: vi.fn(async () => []),
  deleteTrainingPlan: vi.fn(async () => []),
  deleteTrainingPlanApplication: vi.fn(async () => []),
  deleteTrainingPlanSession: vi.fn(async () => []),
  duplicateAthletePlan: vi.fn(async () => []),
  duplicateFolder: vi.fn(async () => []),
  duplicateStrengthSession: vi.fn(async () => []),
  getAthletes: vi.fn(async () => []),
  getGroups: vi.fn(async () => []),
  getMesocycleSessionsContent: vi.fn(async () => []),
  getStrengthPlanningWeekOverrides: vi.fn(async () => []),
  getTrainingPlanApplications: vi.fn(async () => []),
  renameStrengthFolder: vi.fn(async () => []),
  revertMesocycle: vi.fn(async () => []),
  updateTrainingPlan: vi.fn(async () => []),
  upsertTrainingPlanSession: vi.fn(async () => []),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("wouter", () => ({ useLocation: () => ["/coach", navigate] }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: { userId: number; role: string }) => unknown) => sel({ userId: 1, role: "coach" }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import CoachMesocyclesAccordion from "@/components/coach/strength/CoachMesocyclesAccordion";
import StrengthAttendanceBoard from "@/components/coach/strength/StrengthAttendanceBoard";
import TrainingPlansBrowser from "@/components/coach/strength/TrainingPlansBrowser";
import { AthletePlansTab } from "@/components/coach/strength/AthletePlansTab";
import CoachMesocyclePanel from "@/components/coach/CoachMesocyclePanel";

function withQc(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function expectErrorNotEmpty(empty: RegExp) {
  expect(await screen.findByRole("button", { name: /Réessayer/ })).toBeTruthy();
  expect(screen.queryByText(empty)).toBeNull();
}

describe("listes coach muscu — échec réseau ≠ liste vide", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockClear();
  });

  it("Mésocycles actifs (accordéon)", async () => {
    withQc(<CoachMesocyclesAccordion />);
    await expectErrorNotEmpty(/Aucun mésocycle actif/);
  });

  it("Tableau d'assiduité", async () => {
    withQc(<StrengthAttendanceBoard />);
    await expectErrorNotEmpty(/Aucun mésocycle actif/);
  });

  it("Plans d'entraînement", async () => {
    withQc(<TrainingPlansBrowser />);
    await expectErrorNotEmpty(/Aucun plan d'entraînement/);
  });

  it("Plan d'un nageur : pas de CTA de création sur un échec", async () => {
    withQc(
      <AthletePlansTab
        athletes={[{ id: 7, display_name: "Victoria" } as never]}
        selectedAthleteId={7}
        onStartCreateSession={vi.fn()}
        onStartEditSession={vi.fn()}
        onDeleteSession={vi.fn()}
      />,
    );
    await expectErrorNotEmpty(/Aucun plan pour ce nageur/);
  });

  it("Panneau mésocycle d'un nageur", async () => {
    withQc(<CoachMesocyclePanel athleteId={7} athleteName="Victoria" />);
    await expectErrorNotEmpty(/Aucun mésocycle actif/);
  });

  // §396 (🟡5) — l'état vide disait que seul le nageur pouvait générer, sans action.
  it("Panneau mésocycle : aucun méso → le coach peut générer", async () => {
    api.getActiveMesocycle.mockImplementationOnce(async () => null);
    withQc(<CoachMesocyclePanel athleteId={7} athleteName="Victoria" />);
    fireEvent.click(await screen.findByRole("button", { name: "Générer un mésocycle" }));
    expect(navigate).toHaveBeenCalledWith("/coach/mesocycle-generate/7");
  });

  it("Plans nageurs (liste) : échec → pas de « Aucun plan » sous chaque nageur", async () => {
    withQc(
      <AthletePlansTab
        athletes={[{ id: 7, display_name: "Victoria" } as never]}
        selectedAthleteId={null}
        onStartCreateSession={vi.fn()}
        onStartEditSession={vi.fn()}
        onDeleteSession={vi.fn()}
      />,
    );
    await expectErrorNotEmpty(/Aucun plan/);
  });
});
