import React from 'react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center py-10 px-4 text-center', className)}>
    {icon && (
      <div className="mb-3 text-gray-300">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-semibold text-gray-500 mb-1">{title}</h3>
    {description && (
      <p className="text-caption text-gray-400 max-w-[240px] mb-4">{description}</p>
    )}
    {action && (
      <div>{action}</div>
    )}
  </div>
);
