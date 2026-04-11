import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useCoachBreadcrumb, type BreadcrumbSegment } from '@/hooks/useCoachBreadcrumb';
import React from 'react';

interface CoachBreadcrumbProps {
  segments: BreadcrumbSegment[];
}

export default function CoachBreadcrumb({ segments }: CoachBreadcrumbProps) {
  const allSegments = useCoachBreadcrumb(segments);

  if (allSegments.length <= 1) return null;

  return (
    <Breadcrumb className="px-4 py-2">
      <BreadcrumbList>
        {allSegments.map((seg, i) => {
          const isLast = i === allSegments.length - 1;
          return (
            <React.Fragment key={seg.label}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{seg.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={seg.href}>{seg.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
