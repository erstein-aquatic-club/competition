export type TimelineEventWindow = {
  date: string;
  end_date?: string | null;
};

export function getTimelineEventEndDate(event: TimelineEventWindow): string {
  if (event.end_date && event.end_date >= event.date) {
    return event.end_date;
  }
  return event.date;
}

export function isTimelineEventPast(
  event: TimelineEventWindow,
  todayIsoDate: string,
): boolean {
  return getTimelineEventEndDate(event) < todayIsoDate;
}
