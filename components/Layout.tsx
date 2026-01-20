import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen-ios bg-background text-foreground font-sans">
      {/* Desktop Sidebar - Hidden on Mobile */}
      <div className="hidden md:flex h-full fixed left-0 top-0 bottom-0 z-40">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      {/* Added left margin on desktop to account for fixed sidebar */}
      <main className="flex-1 w-full md:ml-64 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto min-h-screen-ios relative">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav - Visible only on Mobile */}
      <BottomNav />
    </div>
  );
};
