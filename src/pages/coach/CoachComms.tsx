export default function CoachComms({
  athletes,
  groups,
  athletesLoading,
}: {
  athletes: unknown[];
  groups: unknown[];
  athletesLoading: boolean;
}) {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground text-sm">Communications — En construction</p>
    </div>
  );
}
