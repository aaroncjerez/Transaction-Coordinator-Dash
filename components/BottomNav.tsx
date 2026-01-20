import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, Settings } from 'lucide-react';
import clsx from 'clsx';

const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
    <NavLink
        to={to}
        className={({ isActive }) =>
            clsx(
                "flex flex-col items-center justify-center w-full py-1 text-xs font-medium transition-colors",
                isActive
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-gray-900"
            )
        }
    >
        {({ isActive }) => (
            <>
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                <span>{label}</span>
            </>
        )}
    </NavLink>
);

export const BottomNav: React.FC = () => {
    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-50 pb-safe pt-2">
            <div className="flex justify-around items-center px-2 h-14">
                <NavItem to="/" icon={LayoutDashboard} label="Deals" />
                <NavItem to="/tasks" icon={CheckSquare} label="Tasks" />
                <NavItem to="/settings" icon={Settings} label="Settings" />
            </div>
        </nav>
    );
};
