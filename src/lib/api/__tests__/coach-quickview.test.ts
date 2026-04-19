import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Reset module registry between tests so mocks take effect
beforeEach(() => mock.reset());

describe('coach-quickview — canUseSupabase=false paths', () => {
  it('getSwimmerBriefing returns null when Supabase is unavailable', async () => {
    mock.module('../client', {
      namedExports: { canUseSupabase: () => false, supabase: {} },
    });
    const { getSwimmerBriefing } = await import('../coach-quickview');
    const result = await getSwimmerBriefing(42);
    assert.strictEqual(result, null);
  });

  it('recordAttendanceAsSub throws when Supabase is unavailable', async () => {
    mock.module('../client', {
      namedExports: { canUseSupabase: () => false, supabase: {} },
    });
    const { recordAttendanceAsSub } = await import('../coach-quickview');
    await assert.rejects(
      () => recordAttendanceAsSub({ dimSessionId: 1, athleteId: 2, status: 'present', recordedBy: 'uuid' }),
      /Supabase not configured/,
    );
  });

  it('addSessionCommentAsSub throws when Supabase is unavailable', async () => {
    mock.module('../client', {
      namedExports: { canUseSupabase: () => false, supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } },
    });
    const { addSessionCommentAsSub } = await import('../coach-quickview');
    await assert.rejects(
      () => addSessionCommentAsSub({ dimSessionId: 1, athleteId: 2, body: 'test' }),
      /Supabase not configured/,
    );
  });
});
