import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const shortcuts: { section: string; items: { keys: string[]; description: string }[] }[] = [
  {
    section: 'Navigation',
    items: [
      { keys: ['J', '\u2193'], description: 'Focus next card' },
      { keys: ['K', '\u2191'], description: 'Focus previous card' },
      { keys: ['Enter'], description: 'Open focused card' },
      { keys: ['Esc'], description: 'Clear focus / close drawer' },
    ],
  },
  {
    section: 'Actions',
    items: [
      { keys: ['N'], description: 'Create new deal' },
      { keys: ['\u2318', 'K'], description: 'Open command palette' },
      { keys: ['/'], description: 'Open command palette' },
    ],
  },
  {
    section: 'This Modal',
    items: [
      { keys: ['?'], description: 'Toggle keyboard shortcuts' },
    ],
  },
];

export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-drawer shadow-lg max-w-sm w-full animate-fade-in"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-label="Keyboard shortcuts"
          aria-modal="true"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Keyboard Shortcuts</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-5 py-4 space-y-5">
            {shortcuts.map(section => (
              <div key={section.section}>
                <h3 className="text-micro font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {section.section}
                </h3>
                <div className="space-y-1.5">
                  {section.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{item.description}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((key, ki) => (
                          <kbd
                            key={ki}
                            className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-micro font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-gray-100 text-center">
            <span className="text-micro text-gray-400">Press <kbd className="font-semibold">?</kbd> to toggle</span>
          </div>
        </div>
      </div>
    </>
  );
};
