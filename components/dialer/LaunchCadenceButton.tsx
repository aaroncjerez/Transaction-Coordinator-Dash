import React, { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { triggerDialerCadence } from '../../lib/database';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';

export const LaunchCadenceButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleLaunch = async () => {
    setLoading(true);
    try {
      await triggerDialerCadence();
      showToast({ message: 'AI cadence triggered — calls will begin shortly', type: 'success' });
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to trigger cadence', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 text-caption font-medium px-3 py-1.5 rounded-md transition-colors',
        loading
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-emerald-600 text-white hover:bg-emerald-700'
      )}
      onClick={handleLaunch}
      disabled={loading}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      {loading ? 'Launching...' : 'Launch Cadence'}
    </button>
  );
};
