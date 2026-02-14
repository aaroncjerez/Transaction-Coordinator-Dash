import React from 'react';
import { ShieldAlert, Flame, CheckCircle } from 'lucide-react';

interface AIReviewBadgeProps {
  review: {
    dnc_detected?: boolean;
    is_hot_lead?: boolean;
  } | null;
}

export const AIReviewBadge: React.FC<AIReviewBadgeProps> = ({ review }) => {
  if (!review) return null;

  return (
    <span className="inline-flex items-center gap-1.5">
      {review.dnc_detected && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-medium text-red-700 bg-red-50">
          <ShieldAlert size={11} />
          DNC
        </span>
      )}
      {review.is_hot_lead && !review.dnc_detected && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-medium text-orange-700 bg-orange-50">
          <Flame size={11} />
          Hot
        </span>
      )}
      {!review.dnc_detected && !review.is_hot_lead && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-micro font-medium text-blue-600 bg-blue-50">
          <CheckCircle size={11} />
          Reviewed
        </span>
      )}
    </span>
  );
};
