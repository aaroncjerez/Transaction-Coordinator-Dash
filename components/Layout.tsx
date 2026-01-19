import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { AskAnything } from './AskAnything';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8 relative">
        {children}
        <AskAnything />
      </main>
    </div>
  );
};
