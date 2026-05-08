import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldRefreshPushSubscription,
  shouldShowPushBanner,
  extractHashPath,
  pushTargetMatchesClient,
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

describe("extractHashPath — extraction du chemin (sans query)", () => {
  it("URL pleine avec hash route", () => {
    assert.equal(
      extractHashPath("https://x.fr/competition/#/profile?section=messages"),
      "/profile",
    );
  });

  it("URL pleine avec hash root", () => {
    assert.equal(extractHashPath("https://x.fr/competition/#/"), "/");
  });

  it("URL pleine sans hash → vide (root du domaine, pas de route SPA)", () => {
    assert.equal(extractHashPath("https://x.fr/competition/"), "");
  });

  it("hash route seul avec #", () => {
    assert.equal(extractHashPath("#/competition/123/prep"), "/competition/123/prep");
  });

  it("route slash sans # (cas wellness `/?wellness=open`)", () => {
    assert.equal(extractHashPath("/?wellness=open"), "/");
  });

  it("route slash sans # avec path", () => {
    assert.equal(extractHashPath("/suivi/entretiens"), "/suivi/entretiens");
  });

  it("chaîne vide", () => {
    assert.equal(extractHashPath(""), "");
  });
});

describe("pushTargetMatchesClient — gate focused contextuel", () => {
  it("match : client sur la même page que la cible", () => {
    assert.equal(
      pushTargetMatchesClient(
        "https://x.fr/competition/#/profile?section=messages",
        "#/profile?section=messages",
      ),
      true,
    );
  });

  it("match : client sur la page cible avec query différente", () => {
    assert.equal(
      pushTargetMatchesClient(
        "https://x.fr/competition/#/profile?section=other",
        "#/profile?section=messages",
      ),
      true,
    );
  });

  it("match : trailing slash ignoré", () => {
    assert.equal(
      pushTargetMatchesClient(
        "https://x.fr/competition/#/profile/",
        "#/profile",
      ),
      true,
    );
  });

  it("no match : page différente → afficher OS notif", () => {
    assert.equal(
      pushTargetMatchesClient(
        "https://x.fr/competition/#/strength",
        "#/profile?section=messages",
      ),
      false,
    );
  });

  it("no match : root vs page profonde", () => {
    assert.equal(
      pushTargetMatchesClient("https://x.fr/competition/#/", "#/profile"),
      false,
    );
  });

  it("no match : client sans hash (page racine domaine sans SPA route) → afficher OS", () => {
    assert.equal(
      pushTargetMatchesClient(
        "https://x.fr/competition/",
        "#/profile",
      ),
      false,
    );
  });

  it("no match : URL cible vide → afficher OS (sécurité)", () => {
    assert.equal(
      pushTargetMatchesClient("https://x.fr/competition/#/profile", ""),
      false,
    );
  });

  it("match : wellness `#/?wellness=open` quand client sur dashboard `#/`", () => {
    // Path commun = '/', les query strings (?wellness=open vs rien) sont
    // ignorées. L'utilisateur est déjà sur la bonne page, le toast §180 suffit.
    assert.equal(
      pushTargetMatchesClient("https://x.fr/competition/#/", "#/?wellness=open"),
      true,
    );
  });
});
