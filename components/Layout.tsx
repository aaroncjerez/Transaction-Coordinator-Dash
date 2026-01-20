import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen-ios bg-gray-50 text-gray-900 font-sans pb-safe">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8 relative">
        {children}
      </main>
    </div>
  );
};
