import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action }) => {
  return (
    <div className="border border-white p-8 text-center flex flex-col items-center justify-center my-4 bg-black">
      <div className="w-10 h-10 border border-white flex items-center justify-center mb-3 font-mono text-xs">
        [--]
      </div>
      <h3 className="text-sm font-mono uppercase tracking-wider text-white font-semibold mb-1">
        {title}
      </h3>
      <p className="text-xs font-mono text-neutral-400 max-w-sm mb-4">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="border border-white px-4 py-1.5 text-xs font-mono uppercase tracking-wider bg-white text-black hover:bg-neutral-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
