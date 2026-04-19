import React from 'react';
import type { SwimmerBriefingWellness } from '@/lib/api/coach-quickview';

const SCORE_CONFIG = [
  { min: 7, label: 'Bonne',    dot: 'bg-emerald-500', text: 'text-emerald-700' },
  { min: 5, label: 'Moyenne',  dot: 'bg-amber-400',   text: 'text-amber-700'   },
  { min: 0, label: 'Basse',    dot: 'bg-red-500 alert', text: 'text-red-700'   },
] as const;

function scoreConfig(s: number) {
  return SCORE_CONFIG.find(c => s >= c.min) ?? SCORE_CONFIG[2];
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

type Props = { wellness: SwimmerBriefingWellness | null };

export default function SwimmerFormBadge({ wellness }: Props) {
  if (!wellness) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">Forme aujourd'hui</p>
          <p className="text-sm font-semibold text-muted-foreground">— Non renseigné</p>
        </div>
      </div>
    );
  }

  const cfg = scoreConfig(wellness.readiness_score);
  return (
    <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
        <div>
          <p className="text-xs text-muted-foreground">Forme aujourd'hui</p>
          <p className={`text-sm font-semibold ${cfg.text}`}>
            {cfg.label} — {wellness.readiness_score}/10
          </p>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground">{formatTime(wellness.logged_at)}</span>
    </div>
  );
}
