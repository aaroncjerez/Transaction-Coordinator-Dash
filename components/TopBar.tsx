import React from 'react';
import { Search, Menu } from 'lucide-react';
import { NotificationCenter } from './NotificationCenter';
import { useMobileSidebar } from '../contexts/MobileSidebarContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onSearchClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ title, subtitle, actions, onSearchClick }) => {
  const { toggle } = useMobileSidebar();

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-5 flex-shrink-0">
      {/* Left: Hamburger (mobile) + Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggle}
          className="md:hidden p-1.5 -ml-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>
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
