import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldRefreshPushSubscription,
  shouldShowPushBanner,
} from "../pushHelpers.ts";

const ONE_DAY = 24 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * ONE_DAY;
const SIXTY_DAYS = 60 * ONE_DAY;

describe("shouldRefreshPushSubscription — cooldown 7j", () => {
  it("refresh quand jamais fait (null)", () => {
    assert.equal(shouldRefreshPushSubscription(Date.now(), null, SEVEN_DAYS), true);
  });

  it("refresh quand timestamp invalide (0)", () => {
    assert.equal(shouldRefreshPushSubscription(Date.now(), 0, SEVEN_DAYS), true);
  });

  it("refresh quand timestamp invalide (NaN)", () => {
    assert.equal(shouldRefreshPushSubscription(Date.now(), NaN, SEVEN_DAYS), true);
  });

  it("refresh quand >= intervalMs depuis le dernier refresh", () => {
    const now = 1_000_000_000_000;
    assert.equal(
      shouldRefreshPushSubscription(now, now - SEVEN_DAYS, SEVEN_DAYS),
      true,
    );
    assert.equal(
      shouldRefreshPushSubscription(now, now - SEVEN_DAYS - 1, SEVEN_DAYS),
      true,
    );
  });

  it("ne refresh PAS si encore dans le cooldown", () => {
    const now = 1_000_000_000_000;
    assert.equal(
      shouldRefreshPushSubscription(now, now - ONE_DAY, SEVEN_DAYS),
      false,
    );
    assert.equal(
      shouldRefreshPushSubscription(now, now - SEVEN_DAYS + 1, SEVEN_DAYS),
      false,
    );
  });
});

describe("shouldShowPushBanner — re-proposition après 60j", () => {
  it("affiche quand jamais dismiss (null)", () => {
    assert.equal(shouldShowPushBanner(Date.now(), null, SIXTY_DAYS), true);
  });

  it("affiche quand legacy dismiss sans timestamp (0)", () => {
    // §194 Vague B : avant ce patch, dismiss = clé seule sans timestamp.
    // À la première re-load après update, on traite comme expiré pour
    // re-prompter les utilisateurs qui auraient perdu leur sub.
    assert.equal(shouldShowPushBanner(Date.now(), 0, SIXTY_DAYS), true);
  });

  it("affiche quand timestamp invalide (NaN)", () => {
    assert.equal(shouldShowPushBanner(Date.now(), NaN, SIXTY_DAYS), true);
  });

  it("affiche quand le dismiss date d'au moins 60j", () => {
    const now = 1_000_000_000_000;
    assert.equal(shouldShowPushBanner(now, now - SIXTY_DAYS, SIXTY_DAYS), true);
    assert.equal(shouldShowPushBanner(now, now - SIXTY_DAYS - 1, SIXTY_DAYS), true);
  });

  it("ne ré-affiche PAS quand le dismiss est récent", () => {
    const now = 1_000_000_000_000;
    assert.equal(shouldShowPushBanner(now, now - ONE_DAY, SIXTY_DAYS), false);
    assert.equal(
      shouldShowPushBanner(now, now - SIXTY_DAYS + 1, SIXTY_DAYS),
      false,
    );
  });
});
