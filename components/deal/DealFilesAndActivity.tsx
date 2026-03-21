import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Activity } from 'lucide-react';
import { DealFiles } from './DealFiles';
import { DealActivity } from './DealActivity';

interface DealFilesAndActivityProps {
  dealId: string;
  fubPersonId?: string;
}

export const DealFilesAndActivity: React.FC<DealFilesAndActivityProps> = ({ dealId, fubPersonId }) => {
  const [activityExpanded, setActivityExpanded] = useState(false);

  return (
    <div className="space-y-4">
      {/* Files — always visible, no collapse wrapper */}
      <DealFiles dealId={dealId} fubPersonId={fubPersonId} />

      {/* Divider */}
      <hr className="border-gray-200" />

      {/* Activity Section — collapsed by default */}
      <div>
        <button
          onClick={() => setActivityExpanded(!activityExpanded)}
          className="flex items-center gap-2 w-full text-left mb-2"
        >
          <Activity size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-900 flex-1">Activity</span>
          {activityExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
        {activityExpanded && <DealActivity dealId={dealId} fubPersonId={fubPersonId} />}
      </div>
    </div>
  );
};
