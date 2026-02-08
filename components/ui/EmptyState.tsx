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

// ---- Onboarding Empty State for Pipeline ----

interface OnboardingEmptyStateProps {
  onGoToSettings: () => void;
  onSyncNow: () => void;
}

export const OnboardingEmptyState: React.FC<OnboardingEmptyStateProps> = ({ onGoToSettings, onSyncNow }) => (
  <div className="flex flex-col items-center justify-center py-20 px-8 text-center max-w-md mx-auto">
    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-md">
      <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    </div>
    <h2 className="text-lg font-semibold text-gray-900 mb-2">Welcome to TC Dash</h2>
    <p className="text-sm text-gray-500 mb-8">Get started by connecting your Follow Up Boss account to sync your deals.</p>

    <div className="space-y-4 w-full text-left">
      <Step number={1} title="Configure your FUB API key" description="Go to Settings and enter your Follow Up Boss API key" />
      <Step number={2} title="Sync your deals" description="Click Sync to pull deals from FUB into your pipeline" />
      <Step number={3} title="Manage your pipeline" description="Drag deals between stages, track tasks, and monitor deadlines" />
    </div>

    <div className="flex gap-3 mt-8">
      <button
        onClick={onGoToSettings}
        className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-md hover:bg-primary/90 transition-colors shadow-sm"
      >
        Go to Settings
      </button>
      <button
        onClick={onSyncNow}
        className="px-4 py-2 text-sm font-medium bg-white text-gray-700 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        Sync Now
      </button>
    </div>
  </div>
);

const Step: React.FC<{ number: number; title: string; description: string }> = ({ number, title, description }) => (
  <div className="flex gap-3">
    <div className="w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-caption font-bold flex-shrink-0 mt-0.5">
      {number}
    </div>
    <div>
      <p className="text-sm font-medium text-gray-800">{title}</p>
      <p className="text-caption text-gray-500">{description}</p>
    </div>
  </div>
);
