import React from 'react';

interface StatusLabelProps {
  status: string;
  type?: 'payment' | 'order' | 'investigation' | 'system';
}

export const StatusLabel: React.FC<StatusLabelProps> = ({ status, type = 'payment' }) => {
  let display = status.toUpperCase();

  // OpenReach strict monochrome style: bordered tags with crisp monospace font
  const isPositive = ['SUCCESS', 'RESOLVED', 'DELIVERED', 'COMPLETED', 'ACTIVE', 'READY'].includes(display);
  const isNegative = ['FAILED', 'DROPPED', 'CANCELLED', 'SIGNATURE_FAILED', 'ERROR'].includes(display);
  const isWarning = ['INVESTIGATING', 'PENDING', 'CHARGED', 'DELAYED', 'MANUAL_REVIEW', 'ESCALATED', 'OFFLINE'].includes(display);

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider border select-none ${
        isNegative
          ? 'bg-black text-white border-white'
          : isPositive
          ? 'bg-white text-black border-white font-semibold'
          : isWarning
          ? 'bg-black text-neutral-300 border-neutral-400'
          : 'bg-black text-neutral-400 border-neutral-700'
      }`}
      title={`${type}: ${display}`}
    >
      [{display}]
    </span>
  );
};
