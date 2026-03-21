import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface AccordionSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  count,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="text-micro px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 tabular-nums">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn('text-gray-400 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="p-4">
          {children}
        </div>
      )}
    </div>
  );
};
