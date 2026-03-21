import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ArrowRight, Home, Settings, Phone, User, RefreshCw, BarChart3, Zap,
} from 'lucide-react';
import { searchDialerLeads, forceDialerSync, triggerDialerCadence } from '../lib/database';
import { cn } from '../lib/utils';
import { formatPhone } from '../lib/utils/phone';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadClick?: (phoneNormalized: string) => void;
}

interface Command {
  id: string;
  label: string;
  section: 'leads' | 'navigation' | 'actions';
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string;
  rightLabel?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onLeadClick }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setLeads([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced lead search
  useEffect(() => {
    if (!isOpen) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (query.trim().length >= 2) {
      setSearching(true);
      searchTimeout.current = setTimeout(async () => {
        try {
          const results = await searchDialerLeads(query.trim(), 10);
          setLeads(results || []);
        } catch {
          setLeads([]);
        } finally {
          setSearching(false);
        }
      }, 200);
    } else {
      setLeads([]);
      setSearching(false);
    }

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [query, isOpen]);

  const navigateAndClose = useCallback((path: string) => {
    navigate(path);
    onClose();
  }, [navigate, onClose]);

  // Build command list
  const commands = useMemo((): Command[] => {
    const cmds: Command[] = [];

    // Lead search results
    for (const lead of leads) {
      const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
      const location = [lead.county, lead.state].filter(Boolean).join(', ');
      cmds.push({
        id: `lead-${lead.id}`,
        label: name,
        section: 'leads',
        icon: <User size={14} />,
        onSelect: () => {
          if (onLeadClick) {
            onLeadClick(lead.phone_normalized);
          } else {
            navigateAndClose('/dialer');
          }
          onClose();
        },
        keywords: `${lead.phone_normalized} ${name} ${location}`,
        rightLabel: location || formatPhone(lead.phone_normalized),
      });
    }

    // Navigation commands
    cmds.push({
      id: 'nav-kpis', label: 'KPIs', section: 'navigation',
      icon: <BarChart3 size={14} />, onSelect: () => navigateAndClose('/kpis'),
      keywords: 'kpis metrics performance dashboard analytics',
    });
    cmds.push({
      id: 'nav-dialer', label: 'AI Dialer', section: 'navigation',
      icon: <Phone size={14} />, onSelect: () => navigateAndClose('/dialer'),
      keywords: 'dialer calls phone ai cold calling campaign',
    });
    cmds.push({
      id: 'nav-settings', label: 'Settings', section: 'navigation',
      icon: <Settings size={14} />, onSelect: () => navigateAndClose('/settings'),
      keywords: 'settings preferences config api keys retell fub',
    });

    // Actions
    cmds.push({
      id: 'action-sync', label: 'Force Sync', section: 'actions',
      icon: <RefreshCw size={14} />,
      onSelect: async () => {
        onClose();
        try { await forceDialerSync(); } catch {}
      },
      keywords: 'sync refresh reload data fub retell',
    });
    cmds.push({
      id: 'action-cadence', label: 'Launch Cadence', section: 'actions',
      icon: <Zap size={14} />,
      onSelect: async () => {
        onClose();
        try { await triggerDialerCadence(); } catch {}
      },
      keywords: 'cadence trigger dial auto call campaign',
    });

    return cmds;
  }, [leads, navigateAndClose, onClose, onLeadClick]);

  // Filter commands (non-lead commands filtered by query)
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands.filter(c => c.section !== 'leads');
    const q = query.toLowerCase();
    return commands.filter(cmd => {
      if (cmd.section === 'leads') return true; // already filtered by search
      const searchStr = `${cmd.label} ${cmd.keywords || ''}`.toLowerCase();
      return searchStr.includes(q);
    });
  }, [commands, query]);

  // Group by section
  const sections = useMemo(() => {
    const grouped: Record<string, Command[]> = {};
    filteredCommands.forEach(cmd => {
      if (!grouped[cmd.section]) grouped[cmd.section] = [];
      grouped[cmd.section].push(cmd);
    });
    return grouped;
  }, [filteredCommands]);

  const sectionOrder = ['leads', 'navigation', 'actions'] as const;
  const sectionLabels: Record<string, string> = {
    leads: 'Leads',
    navigation: 'Navigate',
    actions: 'Actions',
  };

  // Flat list for keyboard navigation
  const flatList = useMemo(() => {
    const list: Command[] = [];
    sectionOrder.forEach(section => {
      if (sections[section]) list.push(...sections[section]);
    });
    return list;
  }, [sections]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatList.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[selectedIndex]) {
          flatList[selectedIndex].onSelect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatList, selectedIndex]);

  if (!isOpen) return null;

  let runningIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-50 animate-fade-in" onClick={onClose} />

      {/* Palette */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
        <div
          className="w-full max-w-[520px] bg-white rounded-drawer shadow-lg border border-gray-200 animate-fade-in overflow-hidden"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-label="Command palette"
          aria-modal="true"
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
            <Search size={16} className="text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search leads by name/phone, navigate, or run actions..."
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {searching && <span className="text-micro text-gray-400">Searching...</span>}
            <kbd className="text-micro text-gray-400 bg-subtle border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto scrollbar-thin py-1">
            {flatList.length === 0 ? (
              <div className="py-8 text-center text-caption text-gray-400">
                {query.trim().length >= 2
                  ? `No results for "${query}"`
                  : 'Type to search leads, or use commands below'}
              </div>
            ) : (
              sectionOrder.map(sectionKey => {
                const items = sections[sectionKey];
                if (!items || items.length === 0) return null;

                return (
                  <div key={sectionKey}>
                    <div className="px-4 py-1.5">
                      <span className="text-micro font-semibold text-gray-400 uppercase tracking-wider">
                        {sectionLabels[sectionKey]}
                      </span>
                    </div>
                    {items.map(cmd => {
                      const index = runningIndex++;
                      const isSelected = index === selectedIndex;
                      return (
                        <button
                          key={cmd.id}
                          data-selected={isSelected}
                          onClick={cmd.onSelect}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors',
                            isSelected
                              ? 'bg-primary-light text-primary'
                              : 'text-gray-700 hover:bg-subtle'
                          )}
                        >
                          <span className={cn(
                            'flex-shrink-0',
                            isSelected ? 'text-primary' : 'text-gray-400'
                          )}>
                            {cmd.icon}
                          </span>
                          <span className="flex-1 truncate font-medium">{cmd.label}</span>
                          {cmd.rightLabel && (
                            <span className="text-micro text-gray-400 flex-shrink-0">
                              {cmd.rightLabel}
                            </span>
                          )}
                          {isSelected && (
                            <ArrowRight size={12} className="text-primary flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-4 py-2 flex items-center gap-4 text-micro text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="bg-subtle border border-gray-200 rounded px-1 py-0.5">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-subtle border border-gray-200 rounded px-1 py-0.5">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-subtle border border-gray-200 rounded px-1 py-0.5">esc</kbd>
              close
            </span>
            <span className="ml-auto flex items-center gap-1">
              <kbd className="bg-subtle border border-gray-200 rounded px-1 py-0.5">⌘K</kbd>
              toggle
            </span>
          </div>
        </div>
      </div>
    </>
  );
};
