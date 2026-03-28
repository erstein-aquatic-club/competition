export default function CoachWeekView({
  groups,
  athletes,
  swimSessions,
  strengthSessions,
}: {
  groups: unknown[];
  athletes: unknown[];
  swimSessions: unknown;
  strengthSessions: unknown;
}) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground text-sm">Semaine — En construction</p>
    </div>
  );
}
