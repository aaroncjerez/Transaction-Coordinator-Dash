import React, { useState, useEffect } from 'react';
import { LayoutGrid, CheckSquare, Archive, Settings, Landmark } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { NotificationCenter } from './NotificationCenter';
import { getFubPersonSyncStatus } from '../lib/database';

const NAV_ITEMS = [
  { to: '/', icon: LayoutGrid, label: 'Pipeline' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/archive', icon: Archive, label: 'Archive' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className={({ isActive }) =>
      clsx(
        'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all border-l-[3px]',
        isActive
          ? 'border-blue-400 bg-white/10 text-white'
          : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
      )
    }
  >
    <Icon size={18} strokeWidth={2} />
    <span>{label}</span>
  </NavLink>
);

export const Sidebar: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  useEffect(() => {
    const checkSync = async () => {
      try {
        const status = await getFubPersonSyncStatus();
        if (status?.lastSync) {
          const ago = Date.now() - new Date(status.lastSync).getTime();
          const mins = Math.floor(ago / 60000);
          setSyncStatus(mins < 1 ? 'Just now' : `${mins}m ago`);
        }
      } catch {
        // Ignore
      }
    };
    checkSync();
    const interval = setInterval(checkSync, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="hidden md:flex w-64 bg-sidebar flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
          <Landmark className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-tight">TC Dash</h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Jerez Land</p>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 mt-2">
        {NAV_ITEMS.map(item => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Bottom Section */}
      <div className="px-4 py-4 border-t border-white/10 space-y-3">
        {/* FUB sync indicator */}
        <div className="flex items-center gap-2 px-1">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <span className="text-xs text-slate-500">
            FUB Sync {syncStatus ? `· ${syncStatus}` : ''}
          </span>
        </div>

        {/* Notification bell */}
        <div className="flex items-center gap-2 px-1">
          <NotificationCenter />
        </div>
      </div>
    </aside>
  );
};
