import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkoutRunner, resolveNextStep } from "./WorkoutRunner";
import { expandContrastPlan } from "@/lib/strength/contrast";
import type { Exercise, StrengthSessionTemplate } from "@/lib/api/types";

const session = {
  id: 9801,
  title: "Contraste jambes",
  name: "Contraste jambes",
  items: [
    { exercise_id: 7, exercise_name: "Trap bar", sets: 3, reps: 3, order_index: 0, percent_1rm: 0,
      rest_seconds: 150, block: "main", raw_payload: {
        training_intent: "force",
        contrast_pair_v1: { id: "tb-cmj", role: "force", rest_seconds: 180 },
      },
    },
    { exercise_id: 123, exercise_name: "CMJ", sets: 3, reps: 3, order_index: 1, percent_1rm: 0,
      rest_seconds: 180, block: "main", raw_payload: {
        training_intent: "puissance", bodyweight_override: true,
        contrast_pair_v1: { id: "tb-cmj", role: "power", rest_seconds: 180 },
      },
    },
  ],
} as unknown as StrengthSessionTemplate;
const exercises = [
  { id: 7, nom_exercice: "Trap bar", exercise_type: "strength" },
  { id: 123, nom_exercice: "CMJ", exercise_type: "strength", is_bodyweight: true },
] as unknown as Exercise[];

describe("mode focus — contraste A/B", () => {
  it("fait A1 puis B1 sans repos intermédiaire, puis repos commun, sans perdre les numéros de séries", async () => {
    const saved: Array<{ exercise_id: number; set_number: number }> = [];
    const now = vi.spyOn(Date, "now");
    const t0 = Date.now();
    now.mockReturnValue(t0);
    try {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
        <WorkoutRunner session={session} exercises={exercises} oneRMs={[]} userId={9801}
          initialStep={1} initialLogs={[]}
          onFinish={() => undefined}
          onLogSets={async (logs) => { saved.push(...logs as typeof saved); }}
        />
        </QueryClientProvider>,
      );
      const go = screen.queryByRole("button", { name: /On y va/i });
      if (go) fireEvent.click(go);
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Trap bar");
      fireEvent.click(screen.getByRole("button", { name: "Valider série" }));
      await act(async () => {});
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("CMJ");
      expect(screen.queryByRole("timer")).toBeNull();
      now.mockReturnValue(t0 + 2_000);
      fireEvent.click(screen.getByRole("button", { name: "Valider série" }));
      await act(async () => {});
      expect(screen.getByRole("timer")).not.toBeNull();
      expect(saved.map((l) => [l.exercise_id, l.set_number])).toEqual([[7, 1], [123, 1]]);
      fireEvent.click(screen.getByRole("button", { name: "Passer le repos" }));
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Trap bar");
      now.mockReturnValue(t0 + 4_000);
      fireEvent.click(screen.getByRole("button", { name: "Valider série" }));
      await act(async () => {});
      expect(saved[2]).toMatchObject({ exercise_id: 7, set_number: 2 });
    } finally {
      now.mockRestore();
    }
  });

  it("reprend à A2 et non A1 avec les logs de A1 et B1", () => {
    const items = expandContrastPlan(session.items ?? []);
    expect(resolveNextStep(items, [
      { exercise_id: 7, set_number: 1, reps: 3, weight: 80 },
      { exercise_id: 123, set_number: 1, reps: 3, weight: -1 },
    ])).toBe(3);
  });
});
