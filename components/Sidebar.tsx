import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  BarChart3, 
  Layers, 
  Bell, 
  LogOut,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';

export const Sidebar: React.FC = () => {
  const [activePath, setActivePath] = React.useState('/dashboard');

  const navItems = [
    { icon: LayoutDashboard, label: 'Overview', path: '/dashboard' },
    { icon: Users, label: 'Customers', path: '/customers' },
    { icon: BarChart3, label: 'Analytics', path: '/analytics' },
    { icon: Layers, label: 'Projects', path: '/projects' },
  ];

  const bottomItems = [
    { icon: Settings, label: 'Settings', path: '/settings' },
    { icon: LogOut, label: 'Log out', path: '/logout' },
  ];

  return (
    <aside className="w-64 flex flex-col h-screen border-r border-gray-200 bg-white sticky top-0 left-0 z-40 hidden md:flex">
      {/* Brand */}
      <div className="h-16 flex items-center px-6 border-b border-gray-100">
        <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center mr-3">
          <span className="text-white font-bold text-xl">N</span>
        </div>
        <span className="font-bold text-gray-900 text-lg tracking-tight">Nexus</span>
      </div>

      {/* Main Nav */}
      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Platform
        </div>
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => setActivePath(item.path)}
            className={cn(
              "w-full flex items-center px-3 py-2 text-sm font-medium rounded-md group transition-colors",
              activePath === item.path 
                ? "bg-gray-100 text-primary" 
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            )}
          >
            <item.icon className={cn("mr-3 h-5 w-5 flex-shrink-0", activePath === item.path ? "text-primary" : "text-gray-400 group-hover:text-gray-500")} />
            {item.label}
          </button>
        ))}
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-gray-100 space-y-1">
         <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Account
        </div>
        {bottomItems.map((item) => (
           <button
           key={item.path}
           className="w-full flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-50 hover:text-gray-900 group transition-colors"
         >
           <item.icon className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
           {item.label}
         </button>
        ))}
        
        {/* User Profile Snippet */}
        <div className="mt-4 flex items-center px-3 py-3 rounded-lg border border-gray-100 bg-gray-50/50">
          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs mr-3">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">John Doe</p>
            <p className="text-xs text-gray-500 truncate">john@nexus.com</p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </div>
      </div>
    </aside>
  );
};
