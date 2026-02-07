import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen bg-background text-foreground font-sans">
      {/* Desktop Sidebar — hidden on mobile */}
      <Sidebar />

      {/* Main Content — offset for sidebar on desktop */}
      <main className="flex-1 md:ml-64 overflow-y-auto pb-20 md:pb-0">
        <div className="max-w-[1600px] mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <BottomNav />
    </div>
  );
};
