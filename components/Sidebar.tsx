import React from 'react';
import { LayoutDashboard, CheckSquare, BarChart3, Settings, Activity } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      clsx(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 text-sm font-medium",
        isActive
          ? "bg-blue-50 text-blue-600"
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      )
    }
  >
    <Icon size={18} strokeWidth={2} />
    <span>{label}</span>
  </NavLink>
);

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col h-full">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
          T
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">
            Tenko
          </h1>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Workspace</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-2">
        <div className="mb-6">
          <p className="px-3 text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Main</p>
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/projects" icon={CheckSquare} label="Projects" />
          <NavItem to="/analytics" icon={BarChart3} label="Analytics" />
        </div>

        <div>
          <p className="px-3 text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">Support</p>
          <NavItem to="/activity" icon={Activity} label="Activity" />
          <NavItem to="/settings" icon={Settings} label="Settings" />
        </div>
      </nav>

      <div className="p-4 border-t border-gray-50">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-gray-200"></div>
          <div className="text-sm">
            <p className="font-medium text-gray-700">Aaron C.</p>
            <p className="text-xs text-gray-400">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
