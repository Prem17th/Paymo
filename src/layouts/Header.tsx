import React from 'react';
import { Menu } from 'lucide-react';

interface HeaderProps {
  onToggleMobileNav: () => void;
  title: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav, title, subtitle }) => {
  return (
    <header className="h-14 border-b border-white bg-black px-4 flex items-center justify-between sticky top-0 z-40 select-none font-mono">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileNav}
          className="md:hidden border border-white p-1 text-white hover:bg-white hover:text-black focus:outline-none"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xs uppercase tracking-wider font-bold text-white leading-none">
            {title}
          </h1>
          {subtitle && (
            <span className="text-[10px] text-neutral-400 block mt-0.5 tracking-wide">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 border border-white px-2.5 py-1 text-[10px] text-white">
          <span className="w-1.5 h-1.5 bg-white inline-block"></span>
          <span>ONLINE</span>
        </div>
      </div>
    </header>
  );
};
