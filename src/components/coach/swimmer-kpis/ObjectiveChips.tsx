import React from 'react';
import type { SwimmerBriefingObjective } from '@/lib/api/coach-quickview';

function formatTime(s: number | null) {
  if (s === null) return null;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${sec}` : `${sec}s`;
}

type Props = { objectives: SwimmerBriefingObjective[] };

export default function ObjectiveChips({ objectives }: Props) {
  if (objectives.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-1">— Aucun objectif renseigné</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {objectives.map((o) => {
        const timeStr = formatTime(o.target_time_seconds);
        return (
          <span
            key={o.id}
            className="inline-flex items-center gap-1 rounded-full border bg-primary/5 px-2.5 py-0.5 text-[11px] font-medium text-primary"
          >
            {o.event_code ?? '—'}
            {timeStr && <span className="text-muted-foreground font-normal">{timeStr}</span>}
            {!o.event_code && o.text && <span>{o.text}</span>}
          </span>
        );
      })}
    </div>
  );
}
