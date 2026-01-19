import React from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentPath, onNavigate }) => {
  return (
    <div className="flex h-screen bg-gray-50 w-full overflow-hidden font-sans antialiased text-gray-900">
      <Sidebar currentPath={currentPath} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col h-full relative">
        {children}
      </div>
    </div>
  );
};
