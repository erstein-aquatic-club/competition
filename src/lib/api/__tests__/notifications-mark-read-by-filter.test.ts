import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyMarkReadFilter } from '../notifications';

// §235 — couvre la logique pure de filtrage utilisée par
// notifications_mark_read_by_filter (branche localStorage). Vérifie :
//   - ciblage par type (single ou multi),
//   - ciblage par needle (titleContains, case-insensitive),
//   - préservation des notifs déjà lues,
//   - préservation des notifs ciblant un autre user,
//   - notifs broadcast (target_user_id null) considérées comme matching.

describe('applyMarkReadFilter — pure data filter', () => {
  it('marks unread + matching type and skips already-read / other users / wrong type', () => {
    const notifs = [
      { id: 1, target_user_id: 7, type: 'wellness', title: 'Comment te sens-tu ?', read: false },
      { id: 2, target_user_id: 7, type: 'wellness', title: 'Comment te sens-tu ?', read: true },
      { id: 3, target_user_id: 7, type: 'message', title: 'Salut', read: false },
      { id: 4, target_user_id: 99, type: 'wellness', title: 'Comment te sens-tu ?', read: false },
      { id: 5, target_user_id: 7, type: 'wellness', title: 'Autre wellness', read: false },
    ];
    const { updated, count } = applyMarkReadFilter(notifs, {
      userId: 7,
      types: ['wellness'],
      needle: null,
    });
    assert.equal(count, 2);
    const byId = Object.fromEntries(updated.map((n: any) => [n.id, n.read]));
    assert.equal(byId[1], true);
    assert.equal(byId[2], true); // stays read
    assert.equal(byId[3], false);
    assert.equal(byId[4], false);
    assert.equal(byId[5], true);
  });

  it('filters by needle (title) case-insensitively', () => {
    const notifs = [
      { id: 10, target_user_id: 1, type: 'assignment', title: 'Séance terminée ?', read: false },
      { id: 11, target_user_id: 1, type: 'assignment', title: 'Nouvelle assignation', read: false },
      { id: 12, target_user_id: 1, type: 'assignment', title: 'séance TERMINÉE ?', read: false },
    ];
    const { updated, count } = applyMarkReadFilter(notifs, {
      userId: 1,
      types: ['assignment'],
      needle: 'séance terminée',
    });
    assert.equal(count, 2);
    const byId = Object.fromEntries(updated.map((n: any) => [n.id, n.read]));
    assert.equal(byId[10], true);
    assert.equal(byId[11], false);
    assert.equal(byId[12], true);
  });

  it('treats broadcast (target_user_id=null) as matching', () => {
    const notifs = [
      { id: 20, target_user_id: null, type: 'wellness', title: 'Hello', read: false },
      { id: 21, target_user_id: 5, type: 'wellness', title: 'Hello', read: false },
    ];
    const { count } = applyMarkReadFilter(notifs, {
      userId: 5,
      types: ['wellness'],
      needle: null,
    });
    assert.equal(count, 2);
  });

  it('returns 0 when no notification matches', () => {
    const notifs = [{ id: 30, target_user_id: 1, type: 'message', title: 'foo', read: false }];
    const { count } = applyMarkReadFilter(notifs, {
      userId: 1,
      types: ['wellness'],
      needle: null,
    });
    assert.equal(count, 0);
  });
});
