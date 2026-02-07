import React, { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { NotificationCenter } from './NotificationCenter';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen-ios bg-background text-foreground font-sans">

      {/* Floating Notification Bell — top-right */}
      <div className="fixed top-4 right-4 z-50">
        <NotificationCenter />
      </div>

      {/* Main Content Area - Centered Full Width */}
      <main className="flex-1 w-full p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto min-h-screen-ios relative">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav - Visible only on Mobile */}
      <BottomNav />
    </div>
  );
};
