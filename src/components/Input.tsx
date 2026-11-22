import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs uppercase tracking-wider font-mono text-neutral-400 font-semibold">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full bg-black border border-white text-white px-3 py-2 text-xs font-mono placeholder:text-neutral-600 focus:outline-none focus:border-white focus:ring-1 focus:ring-white disabled:bg-neutral-950 disabled:border-neutral-800 disabled:text-neutral-600 ${className}`}
        {...props}
      />
      {hint && <span className="text-[11px] font-mono text-neutral-500">{hint}</span>}
      {error && <span className="text-[11px] font-mono text-white bg-neutral-900 px-1 py-0.5 border border-white inline-block">{error}</span>}
    </div>
  );
};
