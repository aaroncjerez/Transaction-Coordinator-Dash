import { StatusColor } from '../../../lib/kpi/types';

interface StatusBadgeProps {
  status: StatusColor;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  text?: string;
}

export function StatusBadge({
  status,
  size = 'md',
  showText = false,
  text,
}: StatusBadgeProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  const emoji = {
    green: '\u{1F7E2}',
    yellow: '\u{1F7E1}',
    red: '\u{1F534}',
  };

  const textColors = {
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
  };

  return (
    <span className={`inline-flex items-center gap-1 ${sizeClasses[size]}`}>
      {emoji[status]}
      {showText && text && (
        <span className={`text-sm font-medium ${textColors[status]}`}>
          {text}
        </span>
      )}
    </span>
  );
}

interface WinLoseBadgeProps {
  isWinning: boolean;
}

export function WinLoseBadge({ isWinning }: WinLoseBadgeProps) {
  if (isWinning) {
    return (
      <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full font-bold text-lg">
        {'\u{1F7E2}'} WINNING
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 bg-red-100 text-red-800 rounded-full font-bold text-lg">
      {'\u{1F534}'} BEHIND
    </span>
  );
}

interface CrushingItBadgeProps {
  show: boolean;
}

export function CrushingItBadge({ show }: CrushingItBadgeProps) {
  if (!show) return null;

  return (
    <span className="inline-flex items-center gap-1 text-yellow-500 font-semibold text-sm">
      {'\u2B50'} CRUSHING IT
    </span>
  );
}
