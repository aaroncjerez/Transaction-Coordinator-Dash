import React from 'react';
import { motion } from 'framer-motion';

interface GamifiedCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: 'primary' | 'success' | 'warning' | 'danger' | 'accent' | 'none';
  animated?: boolean;
  delay?: number;
}

export function GamifiedCard({
  children,
  className = '',
  glowColor = 'none',
  animated = true,
  delay = 0,
}: GamifiedCardProps) {
  const glowClasses = {
    primary: 'shadow-lg shadow-blue-500/20',
    success: 'shadow-lg shadow-green-500/20',
    warning: 'shadow-lg shadow-amber-500/20',
    danger: 'shadow-lg shadow-red-500/20',
    accent: 'shadow-lg shadow-purple-500/20',
    none: '',
  };

  const cardContent = (
    <div
      className={`
        glass-card
        rounded-xl
        p-6
        hover-lift
        ${glowClasses[glowColor]}
        ${className}
      `}
    >
      {children}
    </div>
  );

  if (!animated) {
    return cardContent;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {cardContent}
    </motion.div>
  );
}

export default GamifiedCard;
