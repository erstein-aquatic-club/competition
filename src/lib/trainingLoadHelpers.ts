/**
 * Training Load helpers — pure functions for sRPE / ACWR / monotony / strain.
 */

export function computeSRPE(difficulty: number, durationMinutes: number): number {
  return difficulty * durationMinutes;
}

export function computeAcuteLoad(srpeValues: { date: string; srpe: number }[]): number {
  if (srpeValues.length === 0) return 0;
  const most = srpeValues.reduce((a, b) => (a.date > b.date ? a : b)).date;
  const ref = new Date(most);
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - 6); // 7 days inclusive
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return srpeValues
    .filter((v) => v.date >= cutoffStr && v.date <= most)
    .reduce((sum, v) => sum + v.srpe, 0);
}

export function computeChronicLoad(srpeValues: { date: string; srpe: number }[]): number {
  if (srpeValues.length === 0) return 0;
  const most = srpeValues.reduce((a, b) => (a.date > b.date ? a : b)).date;
  const ref = new Date(most);
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - 27); // 28 days inclusive
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const total = srpeValues
    .filter((v) => v.date >= cutoffStr && v.date <= most)
    .reduce((sum, v) => sum + v.srpe, 0);
  return total / 28;
}

export function computeACWR(acute: number, chronic: number): number | null {
  if (chronic === 0) return null;
  return Math.round((acute / chronic) * 100) / 100;
}

export function acwrZone(acwr: number): 'optimal' | 'warning' | 'danger' {
  if (acwr >= 0.8 && acwr <= 1.3) return 'optimal';
  if (acwr >= 0.6 && acwr <= 1.5) return 'warning';
  return 'danger';
}

export function computeMonotony(dailyLoads: number[]): number {
  if (dailyLoads.length === 0) return 0;
  const mean = dailyLoads.reduce((s, v) => s + v, 0) / dailyLoads.length;
  const variance = dailyLoads.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyLoads.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return 0;
  return mean / stddev;
}

export function computeStrain(totalLoad7d: number, monotony: number): number {
  return totalLoad7d * monotony;
}
