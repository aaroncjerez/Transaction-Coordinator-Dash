import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Activity } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DealFiles } from './DealFiles';
import { DealActivity } from './DealActivity';

interface DealFilesAndActivityProps {
  dealId: string;
  fubPersonId?: string;
}

export const DealFilesAndActivity: React.FC<DealFilesAndActivityProps> = ({ dealId, fubPersonId }) => {
  const [filesExpanded, setFilesExpanded] = useState(true);
  const [activityExpanded, setActivityExpanded] = useState(true);

  return (
    <div className="space-y-4">
      {/* Files Section */}
      <div>
        <button
          onClick={() => setFilesExpanded(!filesExpanded)}
          className="flex items-center gap-2 w-full text-left mb-2"
        >
          <FileText size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-900 flex-1">Files</span>
          {filesExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </button>
        {filesExpanded && <DealFiles dealId={dealId} fubPersonId={fubPersonId} />}
      </div>

      {/* Divider */}
      <hr className="border-gray-200" />

      {/* Activity Section */}
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
