import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from '../components/ToastContainer';
import MicroSlats from '../components/MicroSlats';

export const AppLayout: React.FC = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  const getPageMeta = () => {
    switch (location.pathname) {
      case '/':
      case '/overview':
        return { title: 'Home', subtitle: 'Payment Recovery & Gateway Overview' };
      case '/payments':
        return { title: 'Payments', subtitle: 'Cashfree Sandbox Checkout & Payment History' };
      case '/assistant':
        return { title: 'AI Assistant', subtitle: 'Multilingual Voice & Payment Resolution' };
      case '/settings':
        return { title: 'Settings', subtitle: 'API Integrations & Language Preferences' };
      default:
        return { title: 'Paymo', subtitle: 'Payment Sentinel Interface' };
    }
  };

  const { title, subtitle } = getPageMeta();

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-black text-white selection:bg-white selection:text-black">
      {/* Global animated interactive background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
        style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}
        aria-hidden="true"
      >
        <MicroSlats
          preset="swell"
          color="#000000"
          glintColor="#94a3b8"
          backgroundColor="#000000"
          slatWidth={14}
          slatHeight={12}
          gap={2}
          roundness={0.75}
          interactive
          cursorStrength={1}
          cursorSize={30}
          swirl={0.55}
          trail={1.4}
          lean={0}
          intro
          scale={1.3}
          speed={0.8}
          direction={0}
          stretch={0.2}
          contrast={0.75}
          fog={0.35}
        />
      </div>

      {/* Desktop fixed sidebar */}
      <div className="relative z-10 hidden md:block w-64 h-full shrink-0">
        <Sidebar />
      </div>

      {/* Mobile drawer overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-black/80">
          <div className="w-64 h-full bg-black z-50">
            <Sidebar onCloseMobile={() => setMobileNavOpen(false)} />
          </div>
          <div
            className="flex-1"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close backdrop"
          />
        </div>
      )}

      {/* Main app viewport */}
      <div className="relative z-10 flex-1 flex flex-col h-full overflow-hidden">
        <Header
          onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)}
          title={title}
          subtitle={subtitle}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-transparent">
          <Outlet />
        </main>
      </div>

      <div className="relative z-50">
        <ToastContainer />
      </div>
    </div>
  );
};
