import React from 'react';
import { Sidebar } from './Sidebar';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen bg-gray-50 w-full overflow-hidden font-sans antialiased text-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full relative">
        {children}
      </div>
    </div>
  );
};
