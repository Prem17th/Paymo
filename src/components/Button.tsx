import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-mono uppercase tracking-wider text-xs transition-colors duration-100 border select-none focus:outline-none';
  
  const sizeStyles = {
    sm: 'px-2.5 py-1 text-[11px]',
    md: 'px-4 py-2 text-xs',
    lg: 'px-5 py-2.5 text-sm',
  }[size];

  const variantStyles = {
    primary: disabled
      ? 'bg-neutral-900 text-neutral-600 border-neutral-800 cursor-not-allowed'
      : 'bg-white text-black border-white hover:bg-neutral-200 active:bg-neutral-300',
    secondary: disabled
      ? 'bg-black text-neutral-600 border-neutral-800 cursor-not-allowed'
      : 'bg-black text-white border-white hover:bg-white hover:text-black active:bg-neutral-200',
    danger: disabled
      ? 'bg-black text-neutral-700 border-neutral-800 cursor-not-allowed'
      : 'bg-black text-white border-white hover:bg-neutral-900 active:bg-neutral-800',
    ghost: disabled
      ? 'text-neutral-700 border-transparent cursor-not-allowed'
      : 'text-neutral-400 border-transparent hover:text-white hover:border-neutral-700 hover:bg-neutral-950',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
