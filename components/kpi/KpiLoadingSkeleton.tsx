import React from 'react';

interface KpiLoadingSkeletonProps {
  variant?: 'card' | 'text' | 'circular' | 'stat';
  count?: number;
  className?: string;
}

export function KpiLoadingSkeleton({
  variant = 'card',
  count = 1,
  className = '',
}: KpiLoadingSkeletonProps) {
  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <div className={`glass-card rounded-xl p-6 ${className}`}>
            <div className="animate-shimmer h-4 bg-neutral-200 rounded w-1/3 mb-4" />
            <div className="animate-shimmer h-12 bg-neutral-200 rounded w-2/3 mb-4" />
            <div className="animate-shimmer h-2 bg-neutral-200 rounded w-full" />
          </div>
        );

      case 'text':
        return (
          <div className={className}>
            <div className="animate-shimmer h-4 bg-neutral-200 rounded w-full mb-2" />
            <div className="animate-shimmer h-4 bg-neutral-200 rounded w-5/6" />
          </div>
        );

      case 'circular':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="w-24 h-24 bg-neutral-200 rounded-full" />
          </div>
        );

      case 'stat':
        return (
          <div className={`glass-card rounded-xl p-6 ${className}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="animate-shimmer h-3 bg-neutral-200 rounded w-1/2 mb-3" />
                <div className="animate-shimmer h-10 bg-neutral-200 rounded w-3/4" />
              </div>
              <div className="animate-pulse w-12 h-12 bg-neutral-200 rounded-lg" />
            </div>
            <div className="animate-shimmer h-3 bg-neutral-200 rounded w-1/3" />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={count > 1 ? 'mb-4' : ''}>
          {renderSkeleton()}
        </div>
      ))}
    </>
  );
}

export default KpiLoadingSkeleton;
