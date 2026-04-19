import React from 'react';
import type { SwimmerBriefingPain } from '@/lib/api/coach-quickview';

type Props = { pain: SwimmerBriefingPain | null };

export default function PainIndicator({ pain }: Props) {
  if (!pain || pain.reports_7d === 0 || pain.zones.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">Douleurs actives</p>
          <p className="text-sm font-semibold text-emerald-700">Aucune</p>
        </div>
      </div>
    );
  }

  const isHigh = pain.reports_7d >= 3;
  return (
    <div className="flex items-start justify-between rounded-xl border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ${isHigh ? 'bg-red-500' : 'bg-amber-400'}`} />
        <div>
          <p className="text-xs text-muted-foreground">Douleurs actives</p>
          <p className={`text-sm font-semibold ${isHigh ? 'text-red-700' : 'text-amber-700'}`}>
            {pain.zones.join(', ')}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {pain.reports_7d} signalement{pain.reports_7d > 1 ? 's' : ''} sur 7j
          </p>
        </div>
      </div>
    </div>
  );
}
