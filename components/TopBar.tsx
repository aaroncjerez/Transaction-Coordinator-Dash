import React from 'react';
import { Search } from 'lucide-react';
import { NotificationCenter } from './NotificationCenter';

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onSearchClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, actions, onSearchClick }) => {
  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-5 flex-shrink-0">
      {/* Left: Title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="text-[20px] leading-7 font-semibold text-gray-900 truncate">{title}</h1>
          {subtitle && (
            <p className="text-caption text-gray-500 -mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: Search + Actions + Notifications */}
      <div className="flex items-center gap-2">
        {/* Search trigger */}
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            className="flex items-center gap-2 px-3 py-1.5 text-caption text-gray-400 bg-subtle rounded-md border border-gray-200 hover:border-gray-300 hover:text-gray-500 transition-colors"
          >
            <Search size={14} />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline text-micro bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-400">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Page-specific actions */}
        {actions}

        {/* Notification bell */}
        <NotificationCenter />
      </div>
    </header>
  );
};
