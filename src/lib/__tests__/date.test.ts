import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSwimSessionDefaultTitle, formatRelativeDate } from "@/lib/date";

test("formatSwimSessionDefaultTitle formats the default swim session title", () => {
  const date = new Date(2024, 3, 5);
  assert.equal(formatSwimSessionDefaultTitle(date), "Séance du 05/04/2024 - Soir - Matin");
});

function minutesAgo(n: number, now: Date) {
  return new Date(now.getTime() - n * 60_000).toISOString();
}
function hoursAgo(n: number, now: Date) {
  return new Date(now.getTime() - n * 3_600_000).toISOString();
}

const NOW = new Date("2026-05-08T14:00:00Z");

test("formatRelativeDate — moins d'une heure → 'il y a Xm'", () => {
  assert.equal(formatRelativeDate(minutesAgo(5, NOW), NOW), "il y a 5m");
  assert.equal(formatRelativeDate(minutesAgo(59, NOW), NOW), "il y a 59m");
});

test("formatRelativeDate — moins de 24h → 'il y a Xh'", () => {
  assert.equal(formatRelativeDate(hoursAgo(2, NOW), NOW), "il y a 2h");
  assert.equal(formatRelativeDate(hoursAgo(23, NOW), NOW), "il y a 23h");
});

test("formatRelativeDate — hier → 'hier'", () => {
  const yesterday = new Date("2026-05-07T14:00:00Z").toISOString();
  assert.equal(formatRelativeDate(yesterday, NOW), "hier");
});

test("formatRelativeDate — moins de 7 jours → abréviation du jour", () => {
  // 3 jours avant (mar. 2026-05-05)
  const d = new Date("2026-05-05T10:00:00Z").toISOString();
  assert.equal(formatRelativeDate(d, NOW), "mar.");
});

test("formatRelativeDate — plus de 7 jours → jj/mm", () => {
  const d = new Date("2026-04-20T10:00:00Z").toISOString();
  assert.equal(formatRelativeDate(d, NOW), "20/04");
});

test("formatRelativeDate — date invalide → string brut", () => {
  assert.equal(formatRelativeDate("not-a-date", NOW), "not-a-date");
});

test("formatRelativeDate — date future → jj/mm", () => {
  const future = new Date(NOW.getTime() + 60_000).toISOString(); // dans 1 minute
  assert.equal(formatRelativeDate(future, NOW), "08/05");
});
