/**
 * KpiAnimatedIllustration — dispatcher entre les 5 illustrations SVG animées
 * des protocoles KPI (§295).
 *
 * Chaque illustration est un composant React qui renvoie un SVG inline avec
 * ses keyframes CSS namespacées — pas d'asset binaire, pas de lib d'anim,
 * adapté dark/light mode via `stroke="currentColor"`.
 *
 * Quand un vrai GIF/MP4 sera disponible plus tard, le slot `gifUrl` reste
 * prioritaire dans `KpiGifPanel` — cette illustration est le fallback
 * pédagogique offert immédiatement.
 */
import type { StrengthKpiKey } from '@/lib/api/types';
import { BroadJumpAnim } from './illustrations/BroadJumpAnim';
import { ImtpAnim } from './illustrations/ImtpAnim';
import { MedballThrowAnim } from './illustrations/MedballThrowAnim';
import { VerticalJumpAnim } from './illustrations/VerticalJumpAnim';
import { WeightedPullupAnim } from './illustrations/WeightedPullupAnim';

export interface KpiAnimatedIllustrationProps {
  kpiKey: StrengthKpiKey;
  /** Libellé FR du protocole — utilisé pour `aria-label`. */
  label: string;
}

export function KpiAnimatedIllustration({
  kpiKey,
  label,
}: KpiAnimatedIllustrationProps) {
  const Anim = (() => {
    switch (kpiKey) {
      case 'vertical_jump':
        return VerticalJumpAnim;
      case 'broad_jump':
        return BroadJumpAnim;
      case 'imtp':
        return ImtpAnim;
      case 'weighted_pullup':
        return WeightedPullupAnim;
      case 'medball_vertical_throw':
        return MedballThrowAnim;
    }
  })();

  return (
    <div
      role="img"
      aria-label={`Démonstration animée : ${label}`}
      className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border bg-muted/30 text-foreground/70 dark:bg-muted/10"
    >
      <Anim />
    </div>
  );
}
