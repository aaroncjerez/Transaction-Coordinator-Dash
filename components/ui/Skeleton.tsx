import React from 'react';
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => (
  <div className={cn('skeleton-pulse rounded', className)} />
);

export const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-card border border-gray-200 p-3 space-y-2.5">
    <Skeleton className="h-4 w-3/4 rounded" />
    <Skeleton className="h-3 w-1/2 rounded" />
    <div className="flex gap-2">
      <Skeleton className="h-5 w-14 rounded-sm" />
      <Skeleton className="h-5 w-12 rounded-sm" />
    </div>
    <Skeleton className="h-3 w-full rounded" />
    <Skeleton className="h-3 w-2/3 rounded" />
  </div>
);

export const SkeletonColumn: React.FC = () => (
  <div className="w-[280px] flex-shrink-0 flex flex-col">
    <div className="border-t-2 border-gray-300 bg-white rounded-t-card border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-5 w-6 rounded-full" />
      </div>
    </div>
    <div className="flex-1 bg-subtle rounded-b-card border border-t-0 border-gray-200 p-2 space-y-2">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);

export const SkeletonRow: React.FC = () => (
  <div className="flex items-center gap-3 p-3">
    <Skeleton className="h-4 w-4 rounded-full" />
    <Skeleton className="h-4 flex-1 rounded" />
    <Skeleton className="h-5 w-16 rounded-sm" />
  </div>
);

export const SkeletonDrawer: React.FC = () => (
  <div className="p-6 space-y-6">
    <Skeleton className="h-6 w-2/3 rounded" />
    <div className="flex gap-3">
      <Skeleton className="h-8 w-32 rounded-md" />
      <Skeleton className="h-8 w-24 rounded-md" />
    </div>
    <div className="flex gap-2 border-b border-gray-200 pb-3">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-8 w-20 rounded-md" />
      ))}
    </div>
    <div className="space-y-4">
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="h-20 w-full rounded-md" />
      <Skeleton className="h-4 w-1/2 rounded" />
    </div>
  </div>
);
