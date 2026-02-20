import React, { useState, useEffect } from 'react';
import { Home, LayoutGrid, CheckSquare, BarChart3, TrendingUp, Archive, Settings, Landmark, Phone } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { getFubPersonSyncStatus, fetchAllDeals, fetchAllTasks, fetchDialerTodayCallCount } from '../lib/database';

interface NavItemProps {
  to: string;
  icon: any;
  label: string;
  count?: number;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, count }) => (
  <NavLink
    to={to}
    end={to === '/'}
    className={({ isActive }) =>
      cn(
        'flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-all border-l-[3px] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:rounded-r',
        isActive
          ? 'border-blue-400 bg-white/10 text-white'
          : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
      )
    }
  >
    <Icon size={16} strokeWidth={2} />
    <span className="flex-1">{label}</span>
    {count !== undefined && count > 0 && (
      <span className="text-micro font-semibold bg-white/10 text-slate-400 group-[.active]:text-white px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center">
        {count}
      </span>
    )}
  </NavLink>
);

export const Sidebar: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [dealCount, setDealCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [dialerCallCount, setDialerCallCount] = useState(0);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        const [deals, tasks] = await Promise.all([fetchAllDeals(), fetchAllTasks()]);
        const cancelledDealIds = new Set(
          (deals as any[]).filter(d => d.stage === 'Cancelled').map(d => d.id)
        );
        setDealCount((deals as any[]).length - cancelledDealIds.size);
        setPendingTaskCount(
          (tasks as any[]).filter(t =>
            (t.status === 'To Do' || t.status === 'In Progress') &&
            !cancelledDealIds.has(t.deal_id)
          ).length
        );
      } catch { /* ignore */ }

      try {
        const calls = await fetchDialerTodayCallCount();
        setDialerCallCount(calls);
      } catch { /* ignore */ }
    };

    const checkSync = async () => {
      try {
        const status = await getFubPersonSyncStatus();
        if (status?.lastSync) {
          const ago = Date.now() - new Date(status.lastSync).getTime();
          const mins = Math.floor(ago / 60000);
          setSyncStatus(mins < 1 ? 'Just now' : `${mins}m ago`);
        }
      } catch { /* ignore */ }
    };

    loadCounts();
    checkSync();
    const interval = setInterval(() => { loadCounts(); checkSync(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="hidden md:flex w-56 bg-sidebar flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-4 pt-8 pb-4 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
          <Landmark className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white leading-tight">TC Dash</h1>
          <p className="text-micro uppercase tracking-widest text-slate-500 font-semibold">Jerez Land</p>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 mt-1 space-y-0.5" aria-label="Main navigation">
        <NavItem to="/" icon={Home} label="Dashboard" />
        <NavItem to="/pipeline" icon={LayoutGrid} label="Pipeline" count={dealCount} />
        <NavItem to="/tasks" icon={CheckSquare} label="Tasks" count={pendingTaskCount} />
        <NavItem to="/dialer" icon={Phone} label="AI Dialer" count={dialerCallCount} />
        <NavItem to="/analytics" icon={BarChart3} label="Analytics" />
        <NavItem to="/kpis" icon={TrendingUp} label="KPIs" />
        <NavItem to="/archive" icon={Archive} label="Archive" />
        <NavItem to="/settings" icon={Settings} label="Settings" />
      </nav>

      {/* Bottom: compact sync status */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-micro text-slate-500">
            FUB {syncStatus || 'connecting...'}
          </span>
        </div>
      </div>
    </aside>
  );
};
