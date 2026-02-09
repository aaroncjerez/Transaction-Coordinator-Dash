import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface KpiErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function KpiErrorState({
  title = 'Something went wrong',
  message = 'We encountered an error loading your data. Please try again.',
  onRetry,
  retryLabel = 'Try Again',
}: KpiErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center p-12 text-center"
    >
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>

      <h3 className="text-xl font-semibold text-neutral-900 mb-2">{title}</h3>
      <p className="text-neutral-600 mb-6 max-w-md">{message}</p>

      {onRetry && (
        <motion.button
          onClick={onRetry}
          className="
            inline-flex
            items-center
            gap-2
            px-6
            py-3
            bg-blue-500
            text-white
            rounded-lg
            font-medium
            hover:bg-blue-600
            transition-colors
            focus:outline-none
            focus:ring-2
            focus:ring-blue-500
            focus:ring-offset-2
          "
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw className="w-4 h-4" />
          {retryLabel}
        </motion.button>
      )}
    </motion.div>
  );
}

export default KpiErrorState;
