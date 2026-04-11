import { useMemo } from 'react';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export function useCoachBreadcrumb(segments: BreadcrumbSegment[]) {
  return useMemo(
    () => [{ label: 'Coach', href: '#/coach' }, ...segments],
    [segments],
  );
}
