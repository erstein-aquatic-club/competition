import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// On mocke la façade API (@/lib/api) : le hook orchestre 5 appels existants et
// délègue toute la dérivation au module pur wrappedStats (déjà testé node:test).
// Le test vérifie le branchement réel (aplatissement des runs Supabase →
// SetEntry, garde enabled, assemblage des slides), pas un simple echo du mock.
// La factory vi.mock est hoistée : pas de variable top-level dedans → on
// récupère les fns mockées via vi.mocked après l'import.
vi.mock('@/lib/api', () => ({
  getProfile: vi.fn(),
  getActiveMesocycle: vi.fn(),
  getLatestKpiMeasurements: vi.fn(),
  getStrengthHistory: vi.fn(),
  getExercises: vi.fn(),
}));

import * as api from '@/lib/api';
import { useStrengthWrapped } from './useStrengthWrapped';

const mocks = {
  getProfile: vi.mocked(api.getProfile),
  getActiveMesocycle: vi.mocked(api.getActiveMesocycle),
  getLatestKpiMeasurements: vi.mocked(api.getLatestKpiMeasurements),
  getStrengthHistory: vi.mocked(api.getStrengthHistory),
  getExercises: vi.mocked(api.getExercises),
};

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('useStrengthWrapped', () => {
  it('avec méso + ≥3 séances complétées : enabled + slides objective & volume', async () => {
    // Formes partielles volontaires : le hook ne lit que les champs présents
    // (display_name/birthdate/sex, strength_set_logs, …) → cast `as any` pour
    // garder le mock minimal sans fabriquer toute la forme des types.
    mocks.getProfile.mockResolvedValue({
      id: 1, display_name: 'Jean Test', birthdate: '2000-01-01', sex: 'M',
    } as any);
    mocks.getActiveMesocycle.mockResolvedValue({
      event_group: 'sprint', target_week_count: 8, sessions_per_week: 3,
      bucket_priorities: null,
    } as any);
    mocks.getLatestKpiMeasurements.mockResolvedValue({} as any);
    mocks.getExercises.mockResolvedValue([
      { id: 1, nom_exercice: 'Tractions lestées' },
    ] as any);
    // 3 runs Supabase (chemin strength_set_logs) → ≥3 completedRuns + du volume.
    mocks.getStrengthHistory.mockResolvedValue({
      runs: [
        { id: 'r1', started_at: '2026-05-20T10:00:00Z', strength_set_logs: [
          { exercise_id: 1, reps: 5, weight: 20, set_number: 1, completed_at: null },
        ] },
        { id: 'r2', started_at: '2026-05-15T10:00:00Z', strength_set_logs: [
          { exercise_id: 1, reps: 5, weight: 20, set_number: 1, completed_at: null },
        ] },
        { id: 'r3', started_at: '2026-05-10T10:00:00Z', strength_set_logs: [
          { exercise_id: 1, reps: 5, weight: 20, set_number: 1, completed_at: null },
        ] },
      ],
    } as any);

    const { result } = renderHook(() => useStrengthWrapped(1), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(true);
    const kinds = result.current.slides.map((s) => s.kind);
    expect(kinds).toContain('objective');
    expect(kinds).toContain('volume');
    expect(result.current.athleteName).toBe('Jean Test');
  });

  it('sans données (pas de méso, pas de kpi, 0 séance) : enabled false', async () => {
    mocks.getProfile.mockResolvedValue({
      id: 2, display_name: 'Vide', birthdate: null, sex: null,
    } as any);
    mocks.getActiveMesocycle.mockResolvedValue(null);
    mocks.getLatestKpiMeasurements.mockResolvedValue({} as any);
    mocks.getExercises.mockResolvedValue([]);
    mocks.getStrengthHistory.mockResolvedValue({ runs: [] } as any);

    const { result } = renderHook(() => useStrengthWrapped(2), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.enabled).toBe(false);
    // cover + outro uniquement quand tout est vide.
    expect(result.current.slides.map((s) => s.kind)).toEqual(['cover', 'outro']);
  });

  it('{ active: false } : enabled via méso (signal pas cher) mais pas de fetch lourd → aucune slide volume', async () => {
    mocks.getProfile.mockResolvedValue({
      id: 3, display_name: 'Léger', birthdate: '2000-01-01', sex: 'M',
    } as any);
    mocks.getActiveMesocycle.mockResolvedValue({
      event_group: 'sprint', target_week_count: 8, sessions_per_week: 3,
      bucket_priorities: null,
    } as any);
    mocks.getLatestKpiMeasurements.mockResolvedValue({} as any);
    // history/exercises NE doivent PAS être appelés quand active=false.
    mocks.getExercises.mockResolvedValue([
      { id: 1, nom_exercice: 'Tractions lestées' },
    ] as any);
    mocks.getStrengthHistory.mockResolvedValue({
      runs: [
        { id: 'r1', started_at: '2026-05-20T10:00:00Z', strength_set_logs: [
          { exercise_id: 1, reps: 5, weight: 20, set_number: 1, completed_at: null },
        ] },
      ],
    } as any);

    const { result } = renderHook(
      () => useStrengthWrapped(3, { active: false }),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // enabled = vrai via le méso (signal pas cher), même sans le fetch lourd.
    expect(result.current.enabled).toBe(true);
    // Les requêtes lourdes sont gated → jamais appelées.
    expect(mocks.getStrengthHistory).not.toHaveBeenCalled();
    expect(mocks.getExercises).not.toHaveBeenCalled();
    // Donc aucune slide dérivée de l'historique (volume/progressions/funstat).
    const kinds = result.current.slides.map((s) => s.kind);
    expect(kinds).toContain('objective');
    expect(kinds).not.toContain('volume');
    expect(kinds).not.toContain('progressions');
    expect(kinds).not.toContain('funstat');
  });
});
