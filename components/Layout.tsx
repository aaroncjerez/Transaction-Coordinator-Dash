import React, { ReactNode, createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useCommandPalette } from '../hooks/useCommandPalette';
import { ToastProvider } from './ui/Toast';
import { PreferencesProvider } from '../contexts/PreferencesContext';
import { ReminderNotification } from './ReminderNotification';
import { MobileSidebarProvider, useMobileSidebar } from '../contexts/MobileSidebarContext';
import { cn } from '../lib/utils';

// Context to share command palette open function
const CommandPaletteContext = createContext<{ openCommandPalette: () => void; openShortcutsHelp: () => void }>({
  openCommandPalette: () => {},
  openShortcutsHelp: () => {},
});

export const useOpenCommandPalette = () => useContext(CommandPaletteContext).openCommandPalette;
export const useOpenShortcutsHelp = () => useContext(CommandPaletteContext).openShortcutsHelp;

/** Mobile slide-in drawer overlay */
const MobileSidebarOverlay: React.FC = () => {
  const { isOpen, close } = useMobileSidebar();

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 transform transition-transform duration-200 ease-out md:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar mobile onNavigate={close} />
      </div>
    </>
  );
};

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
        <MobileSidebarProvider>
          <CommandPaletteContext.Provider value={{ openCommandPalette: open, openShortcutsHelp }}>
            <div className="flex h-screen bg-background text-foreground font-sans">
              {/* Desktop Sidebar */}
              <Sidebar />

              {/* Mobile Sidebar Drawer */}
              <MobileSidebarOverlay />

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
        </MobileSidebarProvider>
      </ToastProvider>
    </PreferencesProvider>
  );
};
