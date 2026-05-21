/**
 * KpiGifPanel — visual demo slot for a KPI protocol.
 *
 * Stratégie en cascade (§295) :
 *   1. Si `gifUrl` est fourni (asset binaire externe) → `<img>` direct.
 *   2. Sinon → `<KpiAnimatedIllustration>` (SVG inline animé par cycle CSS).
 *
 * Plus de placeholder « démonstration à venir » — les 5 protocoles ont
 * désormais une illustration animée immédiatement. Si un GIF/MP4 binaire
 * est fourni plus tard (UPDATE `dim_exercices.illustration_gif`), il
 * remplace automatiquement l'animation SVG (le slot reste prioritaire).
 */
import type { StrengthKpiKey } from '@/lib/api/types';
import { KpiAnimatedIllustration } from './KpiAnimatedIllustration';

export function KpiGifPanel({
  gifUrl,
  kpiKey,
  label,
}: {
  gifUrl: string | null;
  kpiKey: StrengthKpiKey;
  label: string;
}) {
  if (gifUrl) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-muted">
        <img
          src={gifUrl}
          alt={`Démonstration : ${label}`}
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  return <KpiAnimatedIllustration kpiKey={kpiKey} label={label} />;
}
