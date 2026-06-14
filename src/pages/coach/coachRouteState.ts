export const COACH_SECTIONS = [
  "home",
  "week",
  "swimmers",
  "library",
  "athlete",
  "groups",
  "competitions",
  "comms",
  "chrono",
  "chrono-history",
  "my-swimmers",
  "comments",
  "pace-calculator",
  "tech-tests",
] as const;

export const COACH_COMMS_TABS = ["notifications", "sms", "historique"] as const;

export type CoachSection = (typeof COACH_SECTIONS)[number];
export type CoachCommsTab = (typeof COACH_COMMS_TABS)[number];

export type CoachRouteState = {
  section: CoachSection;
  tab?: CoachCommsTab;
  athleteId?: number | null;
  weekDate?: string; // YYYY-MM-DD, only for section="week"
  competitionId?: string; // only for section="competitions"
};

function isCoachSection(value: string | null): value is CoachSection {
  return value != null && COACH_SECTIONS.includes(value as CoachSection);
}

function isCoachCommsTab(value: string | null): value is CoachCommsTab {
  return value != null && COACH_COMMS_TABS.includes(value as CoachCommsTab);
}

function parseHashSearchParams(hash: string): URLSearchParams {
  const [, query = ""] = hash.split("?");
  return new URLSearchParams(query);
}

export function parseCoachHashLocation(hash: string): CoachRouteState {
  const params = parseHashSearchParams(hash);
  const rawSection = params.get("section");
  const section = isCoachSection(rawSection) ? rawSection : "home";
  const rawAthleteId = params.get("athleteId");
  const parsedAthleteId = rawAthleteId ? Number(rawAthleteId) : null;
  const rawWeekDate = params.get("weekDate");
  const weekDateValid = rawWeekDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(rawWeekDate);

  return {
    section,
    tab: section === "comms" && isCoachCommsTab(params.get("tab")) ? params.get("tab") as CoachCommsTab : undefined,
    athleteId:
      section === "comms" && parsedAthleteId !== null && Number.isFinite(parsedAthleteId) && parsedAthleteId > 0
        ? parsedAthleteId
        : null,
    weekDate: section === "week" && weekDateValid ? rawWeekDate! : undefined,
    competitionId: section === "competitions" && params.get("competitionId") ? params.get("competitionId")! : undefined,
  };
}

export function buildCoachHash(nextState: CoachRouteState, currentHash = "#/coach"): string {
  const params = parseHashSearchParams(currentHash);

  if (nextState.section === "home") {
    params.delete("section");
  } else {
    params.set("section", nextState.section);
  }

  if (nextState.section === "comms") {
    if (nextState.tab) {
      params.set("tab", nextState.tab);
    } else {
      params.delete("tab");
    }

    if (Number.isFinite(nextState.athleteId) && (nextState.athleteId ?? 0) > 0) {
      params.set("athleteId", String(nextState.athleteId));
    } else {
      params.delete("athleteId");
    }
  } else {
    params.delete("tab");
    params.delete("athleteId");
  }

  if (nextState.section === "week") {
    if (nextState.weekDate && /^\d{4}-\d{2}-\d{2}$/.test(nextState.weekDate)) {
      params.set("weekDate", nextState.weekDate);
    } else {
      params.delete("weekDate");
    }
  } else {
    params.delete("weekDate");
  }

  if (nextState.section === "competitions" && nextState.competitionId) {
    params.set("competitionId", nextState.competitionId);
  } else {
    params.delete("competitionId");
  }

  const query = params.toString();
  return query ? `#/coach?${query}` : "#/coach";
}
