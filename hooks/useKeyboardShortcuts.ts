import { useEffect, useCallback, useRef } from 'react';

// ---- Types ----

interface UseKeyboardShortcutsOptions {
  /** Whether keyboard shortcuts are active (set false when modals/drawers are open) */
  enabled?: boolean;
  /** Ordered list of deal IDs in visual order (left-to-right, top-to-bottom) */
  dealIds: string[];
  /** Currently focused deal ID */
  focusedDealId: string | null;
  /** Callbacks */
  onFocusChange: (dealId: string | null) => void;
  onOpenDeal: (dealId: string) => void;
  onNewDeal: () => void;
}

/**
 * Global keyboard shortcuts for Pipeline kanban navigation.
 *
 * - J/Down: Focus next card
 * - K/Up: Focus previous card
 * - Enter/Space: Open focused card in drawer
 * - Escape: Clear focus / close drawer
 * - N: New deal
 *
 * Note: ⌘K and `/` are handled by useCommandPalette hook.
 */
export function useKeyboardShortcuts({
  enabled = true,
  dealIds,
  focusedDealId,
  onFocusChange,
  onOpenDeal,
  onNewDeal,
}: UseKeyboardShortcutsOptions) {
  // Use refs for stable access in the keydown handler
  const dealIdsRef = useRef(dealIds);
  const focusedRef = useRef(focusedDealId);

  useEffect(() => { dealIdsRef.current = dealIds; }, [dealIds]);
  useEffect(() => { focusedRef.current = focusedDealId; }, [focusedDealId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Ignore when typing in inputs
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

    const ids = dealIdsRef.current;
    const focused = focusedRef.current;

    // ---- J / ArrowDown: next card ----
    if ((e.key === 'j' || e.key === 'ArrowDown') && !isInput && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (ids.length === 0) return;
      if (!focused) {
        onFocusChange(ids[0]);
      } else {
        const idx = ids.indexOf(focused);
        const next = idx < ids.length - 1 ? ids[idx + 1] : ids[0]; // wrap
        onFocusChange(next);
      }
      return;
    }

    // ---- K / ArrowUp: previous card ----
    if ((e.key === 'k' || e.key === 'ArrowUp') && !isInput && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (ids.length === 0) return;
      if (!focused) {
        onFocusChange(ids[ids.length - 1]);
      } else {
        const idx = ids.indexOf(focused);
        const prev = idx > 0 ? ids[idx - 1] : ids[ids.length - 1]; // wrap
        onFocusChange(prev);
      }
      return;
    }

    // ---- Enter / Space: open focused card ----
    if ((e.key === 'Enter' || e.key === ' ') && !isInput && !e.metaKey && !e.ctrlKey) {
      if (focused) {
        e.preventDefault();
        onOpenDeal(focused);
      }
      return;
    }

    // ---- Escape: clear focus ----
    if (e.key === 'Escape') {
      if (focused) {
        onFocusChange(null);
        // Don't prevent default — let drawers/modals also handle Escape
      }
      return;
    }

    // ---- N: new deal ----
    if (e.key === 'n' && !isInput && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onNewDeal();
      return;
    }
  }, [enabled, onFocusChange, onOpenDeal, onNewDeal]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
