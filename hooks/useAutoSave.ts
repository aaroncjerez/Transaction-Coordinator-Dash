import { useRef, useCallback, useEffect, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  /** Async function that persists the accumulated fields */
  saveFn: (fields: Record<string, any>) => Promise<any>;
  /** Debounce delay in ms (default: 800) */
  debounceMs?: number;
  /** Max retry attempts on failure (default: 3) */
  maxRetries?: number;
  /** Called after successful save */
  onSaved?: (result: any) => void;
  /** Called after all retries exhausted */
  onError?: (error: Error, failedFields: Record<string, any>) => void;
}

interface UseAutoSaveReturn {
  /** Queue a field change for debounced saving */
  queueSave: (field: string, value: any) => void;
  /** Immediately flush all pending changes (e.g., on close/unmount) */
  flush: () => Promise<void>;
  /** Current save status */
  status: SaveStatus;
  /** Whether there are unsaved changes queued */
  hasPending: boolean;
}

export function useAutoSave({
  saveFn,
  debounceMs = 800,
  maxRetries = 3,
  onSaved,
  onError,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const pendingRef = useRef<Record<string, any>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  const onSavedRef = useRef(onSaved);
  const onErrorRef = useRef(onError);
  const isSavingRef = useRef(false);

  const [status, setStatus] = useState<SaveStatus>('idle');
  const [hasPending, setHasPending] = useState(false);

  // Keep refs up to date without causing re-renders
  saveFnRef.current = saveFn;
  onSavedRef.current = onSaved;
  onErrorRef.current = onError;

  const executeSave = useCallback(async () => {
    const snapshot = { ...pendingRef.current };
    if (Object.keys(snapshot).length === 0) return;

    pendingRef.current = {};
    setHasPending(false);
    isSavingRef.current = true;
    setStatus('saving');

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await saveFnRef.current(snapshot);
        isSavingRef.current = false;
        setStatus('saved');

        // Clear any previous saved timer
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setStatus('idle'), 2000);

        onSavedRef.current?.(result);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // All retries failed — merge fields back so they aren't lost
    isSavingRef.current = false;
    pendingRef.current = { ...snapshot, ...pendingRef.current };
    setHasPending(Object.keys(pendingRef.current).length > 0);
    setStatus('error');

    // Reset error status after 4 seconds
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setStatus('idle'), 4000);

    onErrorRef.current?.(lastError!, snapshot);
  }, [maxRetries]);

  const queueSave = useCallback((field: string, value: any) => {
    pendingRef.current = { ...pendingRef.current, [field]: value };
    setHasPending(true);

    // Reset debounce timer
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      executeSave();
    }, debounceMs);
  }, [debounceMs, executeSave]);

  const flush = useCallback(async () => {
    // Cancel pending debounce
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Wait for any in-flight save to complete before flushing new changes
    // (simple busy-wait with short intervals)
    let waitAttempts = 0;
    while (isSavingRef.current && waitAttempts < 20) {
      await new Promise(r => setTimeout(r, 50));
      waitAttempts++;
    }

    // Save any remaining pending changes
    if (Object.keys(pendingRef.current).length > 0) {
      await executeSave();
    }
  }, [executeSave]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

      // Synchronous best-effort flush on unmount:
      // We can't await in a cleanup, so fire-and-forget the save
      const remaining = { ...pendingRef.current };
      if (Object.keys(remaining).length > 0) {
        pendingRef.current = {};
        saveFnRef.current(remaining).catch(err =>
          console.error('[useAutoSave] Flush on unmount failed:', err)
        );
      }
    };
  }, []);

  return { queueSave, flush, status, hasPending };
}
