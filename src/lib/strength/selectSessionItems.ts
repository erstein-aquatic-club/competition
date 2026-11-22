import type { StrengthCycleType, StrengthSessionItem, StrengthSessionTemplate } from "@/lib/api/types";
import { orderStrengthItems } from "@/components/strength/utils";

/**
 * Les séances du catalogue historique peuvent contenir plusieurs variantes par
 * cycle dans un même template. Les séances assignées dans « Mon plan », elles,
 * sont des prescriptions complètes : cycle_type est un attribut par exercice,
 * et ne doit JAMAIS servir à masquer un rappel, un tirage ou du gainage.
 *
 * `is_prescribed_plan` est un marqueur client conservé dans la reprise PWA ;
 * aucune migration SQL ni modification des charges du coach.
 */
export function selectSessionItems(
  items: StrengthSessionItem[] = [],
  cycle: StrengthCycleType,
  isPrescribedPlan = false,
): StrengthSessionItem[] {
  if (isPrescribedPlan) return orderStrengthItems(items);
  const cycleItems = items.filter((item) => item.cycle_type === cycle);
  return orderStrengthItems(cycleItems.length > 0 ? cycleItems : items);
}

export function isPrescribedPlanSession(session: StrengthSessionTemplate | null | undefined): boolean {
  return session?.is_prescribed_plan === true;
}
