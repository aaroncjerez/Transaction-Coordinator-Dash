import React, { ReactNode, createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { ToastProvider } from './ui/Toast';
import { PreferencesProvider } from '../contexts/PreferencesContext';
import { ReminderNotification } from './ReminderNotification';

// Context to share command palette open function
const CommandPaletteContext = createContext<{ openCommandPalette: () => void; openShortcutsHelp: () => void }>({
  openCommandPalette: () => {},
  openShortcutsHelp: () => {},
});

export const useOpenCommandPalette = () => useContext(CommandPaletteContext).openCommandPalette;
export const useOpenShortcutsHelp = () => useContext(CommandPaletteContext).openShortcutsHelp;

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isOpen, open, close } = useCommandPalette();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openShortcutsHelp = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcutsHelp = useCallback(() => setShortcutsOpen(false), []);

  // Global ? key listener for shortcuts help
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !isOpen) {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
        if (!isInput) {
          e.preventDefault();
          setShortcutsOpen(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  return (
    <PreferencesProvider>
      <ToastProvider>
        <CommandPaletteContext.Provider value={{ openCommandPalette: open, openShortcutsHelp }}>
          <div className="flex h-screen bg-background text-foreground font-sans">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Main Content — offset for sidebar, TopBar rendered per-page */}
            <main className="flex-1 md:ml-56 flex flex-col overflow-hidden">
              {children}
            </main>

            {/* Global Command Palette */}
            <CommandPalette isOpen={isOpen} onClose={close} />

            {/* Keyboard Shortcuts Help */}
            <KeyboardShortcutsHelp isOpen={shortcutsOpen} onClose={closeShortcutsHelp} />

            {/* Global Reminder Notifications */}
            <ReminderNotification />
          </div>
        </CommandPaletteContext.Provider>
      </ToastProvider>
    </PreferencesProvider>
  );
};
