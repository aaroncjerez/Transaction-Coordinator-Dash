import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ArrowRight, Home, LayoutDashboard, CheckSquare, Archive, Settings,
  Plus, RefreshCw, Folder,
} from 'lucide-react';
import { Deal } from '../types';
import { fetchAllDeals } from '../lib/database';
import { cn } from '../lib/utils';
import { getStageColor } from '../constants';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Command {
  id: string;
  label: string;
  section: 'deals' | 'navigation' | 'actions';
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string;
  rightLabel?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Load deals when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      fetchAllDeals().then(d => setDeals(d as Deal[]));
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const navigateAndClose = useCallback((path: string) => {
    navigate(path);
    onClose();
  }, [navigate, onClose]);

  // Build command list
  const commands = useMemo((): Command[] => {
    const cmds: Command[] = [];

    // Navigation commands
    cmds.push({
      id: 'nav-dashboard', label: 'Dashboard', section: 'navigation',
      icon: <Home size={14} />, onSelect: () => navigateAndClose('/'),
      keywords: 'dashboard home today overview',
    });
    cmds.push({
      id: 'nav-pipeline', label: 'Pipeline', section: 'navigation',
      icon: <LayoutDashboard size={14} />, onSelect: () => navigateAndClose('/pipeline'),
      keywords: 'pipeline kanban board deals',
    });
    cmds.push({
      id: 'nav-tasks', label: 'Tasks', section: 'navigation',
      icon: <CheckSquare size={14} />, onSelect: () => navigateAndClose('/tasks'),
      keywords: 'tasks todo checklist',
    });
    cmds.push({
      id: 'nav-archive', label: 'Archive', section: 'navigation',
      icon: <Archive size={14} />, onSelect: () => navigateAndClose('/archive'),
      keywords: 'archive cancelled closed',
    });
    cmds.push({
      id: 'nav-settings', label: 'Settings', section: 'navigation',
      icon: <Settings size={14} />, onSelect: () => navigateAndClose('/settings'),
      keywords: 'settings preferences config api keys',
    });

    // Action commands
    cmds.push({
      id: 'action-new-deal', label: 'New Deal', section: 'actions',
      icon: <Plus size={14} />, onSelect: () => navigateAndClose('/pipeline'),
      keywords: 'create new deal add',
    });

    // Deal commands
    deals.forEach(deal => {
      const sc = getStageColor(deal.stage);
      cmds.push({
        id: `deal-${deal.id}`, label: deal.deal_name, section: 'deals',
        icon: <Folder size={14} />,
        onSelect: () => navigateAndClose(`/deals/${deal.id}`),
        keywords: `${deal.deal_name} ${deal.county} ${deal.state} ${deal.deal_type} ${deal.stage}`.toLowerCase(),
        rightLabel: deal.stage,
      });
    });

    return cmds;
  }, [deals, navigateAndClose]);

  // Filter commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(cmd => {
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

  const sectionOrder = ['deals', 'navigation', 'actions'] as const;
  const sectionLabels: Record<string, string> = {
    deals: 'Deals',
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
              placeholder="Search deals, navigate, or run actions..."
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <kbd className="text-micro text-gray-400 bg-subtle border border-gray-200 rounded px-1.5 py-0.5 flex-shrink-0">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto scrollbar-thin py-1">
            {flatList.length === 0 ? (
              <div className="py-8 text-center text-caption text-gray-400">
                No results for "{query}"
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
              <kbd className="bg-subtle border border-gray-200 rounded px-1 py-0.5">?</kbd>
              shortcuts
            </span>
          </div>
        </div>
      </div>
    </>
  );
};
