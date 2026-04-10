import { useReducer } from "react";
import { chronoReducer, initialChronoState } from "../../lib/chrono-reducer";
import { useChronoTimer } from "../../hooks/useChronoTimer";
import ChronoSetup from "../../components/chrono/ChronoSetup";
import ChronoRace from "../../components/chrono/ChronoRace";
import ChronoResults from "../../components/chrono/ChronoResults";
import type { AthleteSummary } from "../../lib/api/types";

interface Props {
  athletes: AthleteSummary[];
}

export default function CoachChronoScreen({ athletes }: Props) {
  const [state, dispatch] = useReducer(chronoReducer, initialChronoState);

  const isRacing = state.phase === "racing" && state.waves.some((w) => w.startedAt && !w.stopped);
  const { now, getTimestamp } = useChronoTimer(isRacing);

  return (
    <div className="max-w-6xl mx-auto p-4">
      {state.phase === "setup" && (
        <ChronoSetup state={state} dispatch={dispatch} athletes={athletes} />
      )}
      {state.phase === "racing" && (
        <ChronoRace state={state} dispatch={dispatch} now={now} getTimestamp={getTimestamp} />
      )}
      {state.phase === "results" && (
        <ChronoResults state={state} dispatch={dispatch} />
      )}
    </div>
  );
}
