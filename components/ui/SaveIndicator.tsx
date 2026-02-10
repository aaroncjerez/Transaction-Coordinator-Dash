import React from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { SaveStatus } from '../../hooks/useAutoSave';

interface SaveIndicatorProps {
  status: SaveStatus;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({ status }) => {
  if (status === 'idle') return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-micro font-medium animate-fade-in transition-opacity',
        status === 'saving' && 'text-gray-400',
        status === 'saved' && 'text-emerald-500',
        status === 'error' && 'text-red-500',
      )}
    >
      {status === 'saving' && (
        <>
          <Loader2 size={11} className="animate-spin" />
          Saving...
        </>
      )}
      {status === 'saved' && (
        <>
          <Check size={11} />
          Saved
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={11} />
          Save failed
        </>
      )}
    </span>
  );
};
