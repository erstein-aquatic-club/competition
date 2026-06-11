// §380 — le compte à rebours de repos vit DANS RestScreen (tick local sur
// `restEndAt`) au lieu d'être un state du parent WorkoutRunner : avant, chaque
// seconde de repos re-rendait les ~1900 lignes du runner. Le parent ne fournit
// que le timestamp de fin + onExpire (notification/toast/fermeture).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

import { RestScreen } from "@/components/strength/RestScreen";

vi.mock("@/components/strength/RestExerciseTab", () => ({
  RestExerciseTab: () => <div data-testid="tab-exercise" />,
}));
vi.mock("@/components/strength/RestSessionTab", () => ({
  RestSessionTab: () => <div data-testid="tab-session" />,
}));
vi.mock("@/components/strength/RestPerfsTab", () => ({
  RestPerfsTab: () => <div data-testid="tab-perfs" />,
}));

function restElement(over: Record<string, unknown> = {}) {
  return (
    <RestScreen
      restEndAt={Date.now() + 90_000}
      restDuration={90}
      restType="set"
      exercise={null}
      block={null}
      nextExercise={null}
      nextBlock={null}
      targetWeight={0}
      muscleTags={[]}
      items={[]}
      logs={[]}
      exercises={[]}
      currentStep={1}
      progressPct={0}
      oneRmWeight={0}
      percentOneRm={0}
      athleteNote=""
      exerciseId={-1}
      currentSetIndex={1}
      totalSets={3}
      userId={1}
      onClose={() => undefined}
      onSkip={() => undefined}
      onAdd30s={() => undefined}
      onExpire={() => undefined}
      {...over}
    />
  );
}

describe("RestScreen — compte à rebours autonome (§380)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("affiche le temps restant dérivé de restEndAt", () => {
    render(restElement());
    expect(screen.getByRole("timer").textContent).toBe("1:30");
  });

  it("décrémente seul, sans re-render piloté par le parent", () => {
    render(restElement());
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("1:27");
  });

  it("appelle onExpire une seule fois à zéro", () => {
    const onExpire = vi.fn();
    render(restElement({ restEndAt: Date.now() + 2_000, onExpire }));
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("un restEndAt repoussé (+30s) étend le temps restant affiché", () => {
    const start = Date.now();
    const { rerender } = render(restElement({ restEndAt: start + 10_000 }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("0:05");
    rerender(restElement({ restEndAt: start + 40_000 }));
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("0:34");
  });
});
