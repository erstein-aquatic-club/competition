// Tests vitest jsdom du bandeau « hero » de Mon plan muscu (§341 Lot 3, V5/V8).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MyPlanMesocycleBanner } from "@/components/strength/MyPlanMesocycleBanner";

describe("MyPlanMesocycleBanner", () => {
  it("affiche objectif, Semaine X/Y, phase et date de génération (active)", () => {
    render(
      <MyPlanMesocycleBanner
        objective="50 m crawl"
        kindLabel="Prépa de saison"
        weekNumber={3}
        totalWeeks={8}
        status="active"
        phaseLabel="Force max"
        phase="force"
        generatedAtLabel="12 mai"
      />,
    );
    expect(screen.getByText("50 m crawl")).toBeTruthy();
    expect(screen.getByText("Semaine 3 / 8")).toBeTruthy();
    expect(screen.getByText("Force max")).toBeTruthy();
    expect(screen.getByText(/Généré le 12 mai/)).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("8");
  });

  it("statut upcoming → 'Débute bientôt', aucune puce de phase si phaseLabel null", () => {
    render(
      <MyPlanMesocycleBanner
        objective="100 m papillon"
        kindLabel="Inter-compétitions"
        weekNumber={1}
        totalWeeks={6}
        status="upcoming"
        phaseLabel={null}
        phase="reprise"
        generatedAtLabel={null}
      />,
    );
    expect(screen.getByText("Débute bientôt")).toBeTruthy();
    expect(screen.queryByText(/Généré le/)).toBeNull();
    // aria-valuenow = 0 pour un cycle pas encore commencé.
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("statut done → 'Cycle terminé'", () => {
    render(
      <MyPlanMesocycleBanner
        objective="50 m crawl"
        kindLabel="Prépa de saison"
        weekNumber={8}
        totalWeeks={8}
        status="done"
        phaseLabel="Pic"
        phase="compétition"
        generatedAtLabel="1 juin"
      />,
    );
    expect(screen.getByText("Cycle terminé")).toBeTruthy();
  });

  it("bouton Récap intégré : visible si recapEnabled, déclenche onOpenRecap (§345)", () => {
    const onOpenRecap = vi.fn();
    render(
      <MyPlanMesocycleBanner
        objective="50 m crawl"
        kindLabel="Prépa de saison"
        weekNumber={3}
        totalWeeks={8}
        status="active"
        phaseLabel="Force max"
        phase="force"
        generatedAtLabel="12 mai"
        recapEnabled
        onOpenRecap={onOpenRecap}
      />,
    );
    const recap = screen.getByRole("button", { name: /Récap/ });
    fireEvent.click(recap);
    expect(onOpenRecap).toHaveBeenCalledTimes(1);
  });

  it("pas de bouton Récap si recapEnabled est absent", () => {
    render(
      <MyPlanMesocycleBanner
        objective="50 m crawl"
        kindLabel="Prépa de saison"
        weekNumber={3}
        totalWeeks={8}
        status="active"
        phaseLabel="Force max"
        phase="force"
        generatedAtLabel="12 mai"
      />,
    );
    expect(screen.queryByRole("button", { name: /Récap/ })).toBeNull();
  });

  it("raccourcit les libellés longs dans la puce (Puissance / vitesse → Puissance)", () => {
    render(
      <MyPlanMesocycleBanner
        objective="50 m crawl"
        kindLabel="Prépa de saison"
        weekNumber={5}
        totalWeeks={8}
        status="active"
        phaseLabel="Puissance / vitesse"
        phase="puissance"
        generatedAtLabel="12 mai"
      />,
    );
    expect(screen.getByText("Puissance")).toBeTruthy();
    expect(screen.queryByText("Puissance / vitesse")).toBeNull();
  });
});
