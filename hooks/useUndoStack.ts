import { useRef, useState, useCallback } from 'react';

export type UndoActionType =
  | 'task_status_change'
  | 'task_create'
  | 'deal_stage_change'
  | 'deal_field_update';

export interface UndoAction {
  type: UndoActionType;
  label: string;
  timestamp: number;
  revert: () => Promise<void>;
}

interface UseUndoStackOptions {
  maxSize?: number;
}

export function useUndoStack({ maxSize = 20 }: UseUndoStackOptions = {}) {
  const stackRef = useRef<UndoAction[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const pushUndo = useCallback((action: UndoAction) => {
    stackRef.current = [action, ...stackRef.current].slice(0, maxSize);
    setCanUndo(true);
  }, [maxSize]);

  const undo = useCallback(async () => {
    const action = stackRef.current.shift();
    if (!action) return;
    setCanUndo(stackRef.current.length > 0);
    try {
      await action.revert();
    } catch (err) {
      console.error('Undo failed:', err);
    }
  }, []);

  return { pushUndo, undo, canUndo };
}
