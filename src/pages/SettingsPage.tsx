import React, { useState, useEffect } from 'react';
import { usePaymo } from '../context/PaymoContext';
import { Button } from '../components/Button';
import { api } from '../lib/api';
import { RefreshCw, Globe, Server } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { showToast } = usePaymo();

  const [preferredLanguage, setPreferredLanguage] = useState('en-IN');
  const [loading, setLoading] = useState<boolean>(true);

  // Live Service Connection Statuses
  const [openaiStatus, setOpenaiStatus] = useState<{
    configured: boolean;
    reachable: boolean;
    model: string;
    status: string;
  } | null>(null);

  const [sarvamStatus, setSarvamStatus] = useState<{
    configured: boolean;
    reachable: boolean;
    stt_model: string;
    tts_model: string;
    status: string;
  } | null>(null);

  const [cashfreeStatus, setCashfreeStatus] = useState<{
    configured: boolean;
    reachable: boolean;
    environment: string;
    status: string;
  } | null>(null);

  const fetchStatuses = async () => {
    try {
      setLoading(true);
      const [openai, sarvam, cashfree] = await Promise.all([
        api.getAgentAuditStatus().catch(() => null),
        api.getVoiceStatus().catch(() => null),
        api.getCashfreeStatus().catch(() => null),
      ]);
      if (openai) setOpenaiStatus(openai);
      if (sarvam) setSarvamStatus(sarvam);
      if (cashfree) setCashfreeStatus(cashfree);
    } catch {
      showToast('Could not reach backend services.', 'warn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const handleSaveLanguage = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(`Preferred language set to ${preferredLanguage}.`, 'success');
  };

  return (
    <div className="space-y-6 font-mono text-white max-w-4xl mx-auto select-none">
      {/* Header */}
      <div className="border-b border-white pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider">
            Settings
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Service connections and language preferences.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={fetchStatuses}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Status</span>
        </Button>
      </div>

      {/* Connection Statuses */}
      <div className="border border-white bg-black p-5 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b border-neutral-800 pb-2">
          <Server className="w-4 h-4 text-white" />
          <span>Connected Services</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* OpenAI */}
          <div className="border border-neutral-800 p-3.5 bg-neutral-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-400 uppercase font-bold">OpenAI GPT</span>
              <span
                className={`px-1.5 py-0.5 text-[9px] uppercase border ${
                  openaiStatus?.configured && openaiStatus?.reachable
                    ? 'border-white text-white font-bold'
                    : 'border-neutral-700 text-neutral-500'
                }`}
              >
                {openaiStatus?.configured
                  ? (openaiStatus.reachable ? 'Connected' : 'Offline')
                  : 'Not Configured'}
              </span>
            </div>
            <div className="font-semibold text-white">
              {openaiStatus?.model || 'gpt-4o-mini'}
            </div>
            <div className="text-[10px] text-neutral-500">
              Conversational reasoning & report generation
            </div>
          </div>

          {/* Sarvam AI */}
          <div className="border border-neutral-800 p-3.5 bg-neutral-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Sarvam AI</span>
              <span
                className={`px-1.5 py-0.5 text-[9px] uppercase border ${
                  sarvamStatus?.configured && sarvamStatus?.reachable
                    ? 'border-white text-white font-bold'
                    : 'border-neutral-700 text-neutral-500'
                }`}
              >
                {sarvamStatus?.configured
                  ? (sarvamStatus.reachable ? 'Connected' : 'Offline')
                  : 'Not Configured'}
              </span>
            </div>
            <div className="font-semibold text-white">
              STT: {sarvamStatus?.stt_model || 'saaras:v3'}
            </div>
            <div className="text-[10px] text-neutral-500">
              TTS: {sarvamStatus?.tts_model || 'bulbul:v3'} (kavya)
            </div>
          </div>

          {/* Cashfree Sandbox */}
          <div className="border border-neutral-800 p-3.5 bg-neutral-950 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-400 uppercase font-bold">Cashfree Gateway</span>
              <span
                className={`px-1.5 py-0.5 text-[9px] uppercase border ${
                  cashfreeStatus?.configured && cashfreeStatus?.reachable
                    ? 'border-white text-white font-bold'
                    : 'border-neutral-700 text-neutral-500'
                }`}
              >
                {cashfreeStatus?.configured
                  ? (cashfreeStatus.reachable ? 'Sandbox Active' : 'Auth Failed')
                  : 'Not Configured'}
              </span>
            </div>
            <div className="font-semibold text-white">
              Mode: {cashfreeStatus?.environment || 'sandbox'}
            </div>
            <div className="text-[10px] text-neutral-500">
              Merchant payment collection & verification
            </div>
          </div>
        </div>
      </div>

      {/* Language Preferences */}
      <div className="border border-white bg-black p-5 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b border-neutral-800 pb-2">
          <Globe className="w-4 h-4 text-white" />
          <span>Preferred Language</span>
        </h2>

        <form onSubmit={handleSaveLanguage} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] text-neutral-400 uppercase mb-1.5">
              Default Voice and Assistant Language
            </label>
            <select
              value={preferredLanguage}
              onChange={(e) => setPreferredLanguage(e.target.value)}
              className="w-full bg-black border border-white text-white px-3 py-2 text-xs font-mono focus:outline-none"
            >
              <option value="en-IN">English (India) — en-IN</option>
              <option value="kn-IN">Kannada (ಕನ್ನಡ) — kn-IN</option>
              <option value="hi-IN">Hindi (हिंदी) — hi-IN</option>
              <option value="ta-IN">Tamil (தமிழ்) — ta-IN</option>
              <option value="te-IN">Telugu (తెలుగు) — te-IN</option>
            </select>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary">
              Save Preference
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
