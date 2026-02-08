import React, { ReactNode, createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { useCommandPalette } from '../hooks/useCommandPalette';

// Context to share command palette open function
const CommandPaletteContext = createContext<{ openCommandPalette: () => void }>({
  openCommandPalette: () => {},
});

export const useOpenCommandPalette = () => useContext(CommandPaletteContext).openCommandPalette;

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isOpen, open, close } = useCommandPalette();

  return (
    <CommandPaletteContext.Provider value={{ openCommandPalette: open }}>
      <div className="flex h-screen bg-background text-foreground font-sans">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Main Content — offset for sidebar, TopBar rendered per-page */}
        <main className="flex-1 md:ml-56 flex flex-col overflow-hidden">
          {children}
        </main>

        {/* Global Command Palette */}
        <CommandPalette isOpen={isOpen} onClose={close} />
      </div>
    </CommandPaletteContext.Provider>
  );
};
