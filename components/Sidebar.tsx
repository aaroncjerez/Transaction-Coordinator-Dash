import React from 'react';
import { LayoutDashboard, CheckSquare, BarChart3, Settings, Activity } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      clsx(
        "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-1",
        isActive
          ? "bg-blue-600 text-white shadow-md"
          : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
      )
    }
  >
    <Icon size={20} />
    <span className="font-medium">{label}</span>
  </NavLink>
);

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          TC-Engine
        </h1>
        <p className="text-xs text-gray-500 mt-1">Transaction Command</p>
      </div>

      <nav className="flex-1 p-4">
        <NavItem to="/" icon={LayoutDashboard} label="Deals" />
        <NavItem to="/tasks" icon={CheckSquare} label="Tasks" />
        <NavItem to="/analytics" icon={BarChart3} label="Analytics" />
      </nav>

      <div className="p-4 border-t border-gray-100">
        <div className="mb-4 px-4">
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-full w-fit">
            <Activity size={14} />
            <span className="font-semibold">System Healthy</span>
          </div>
        </div>
        <NavItem to="/settings" icon={Settings} label="Settings" />
      </div>
    </aside>
  );
};
