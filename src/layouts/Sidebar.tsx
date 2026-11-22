import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CreditCard, Settings } from 'lucide-react';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCloseMobile }) => {
  const navItems = [
    { name: 'Home', path: '/', icon: LayoutDashboard },
    { name: 'Payments', path: '/payments', icon: CreditCard },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 h-full bg-black border-r border-white flex flex-col justify-between select-none">
      {/* Top brand header */}
      <div>
        <div className="p-4 border-b border-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white text-black flex items-center justify-center font-bold text-sm tracking-tighter">
              P
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-widest uppercase font-mono leading-none text-white">
                PAYMO
              </h1>
              <span className="text-[10px] font-mono text-neutral-400 tracking-wider">
                AI PAYMENT ASSISTANT
              </span>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-none ${
                    isActive
                      ? 'bg-white text-black font-semibold border border-white'
                      : 'text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom status */}
      <div className="p-4 border-t border-white font-mono text-[11px] space-y-1 bg-black">
        <div className="flex items-center justify-between text-neutral-400">
          <span>STATUS</span>
          <span className="text-white">ONLINE</span>
        </div>
        <div className="flex items-center justify-between text-neutral-400">
          <span>MODE</span>
          <span className="text-white">VOICE FIRST</span>
        </div>
      </div>
    </aside>
  );
};
