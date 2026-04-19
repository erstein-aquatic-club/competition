import React from 'react';
import type { SwimmerBriefingLoad } from '@/lib/api/coach-quickview';

type Props = { load: SwimmerBriefingLoad | null };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-base font-bold tabular-nums">{value}</span>
      <span className="text-[10px] text-muted-foreground leading-tight text-center">{label}</span>
    </div>
  );
}

export default function LoadMini({ load }: Props) {
  if (!load) {
    return (
      <div className="rounded-xl border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
        — Aucune donnée de charge
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground mb-2">Charge 7 derniers jours</p>
      <div className="grid grid-cols-3 divide-x divide-border text-center">
        <Stat label="km" value={String(load.volume_7d_km)} />
        <Stat label="séances" value={String(load.sessions_7d)} />
        <Stat label="RPE moy." value={load.avg_rpe_7d > 0 ? String(load.avg_rpe_7d) : '—'} />
      </div>
    </div>
  );
}
