import React, { useState, useEffect } from 'react';
import { usePaymo } from '../context/PaymoContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { StatusLabel } from '../components/StatusLabel';
import { CHAOS_SCENARIOS, MCP_TOOLS } from '../data/demoData';
import { ChaosTestResult } from '../types';
import { api } from '../lib/api';
import { Search, Play, Copy, Check, Terminal, AlertTriangle, RefreshCw } from 'lucide-react';

export const DeveloperPage: React.FC = () => {
  const { showToast } = usePaymo();

  // 1. Payment Investigation State
  const [investigateOrderId, setInvestigateOrderId] = useState('ORD_9823412');
  const [investigationResult, setInvestigationResult] = useState<{
    found: boolean;
    orderId: string;
    details?: string;
    gatewayStatus?: string;
    merchantStatus?: string;
    rawTrace?: string;
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // 2. Payment Chaos Lab State
  const [selectedScenarioId, setSelectedScenarioId] = useState(CHAOS_SCENARIOS[0].id);
  const [testHistory, setTestHistory] = useState<ChaosTestResult[]>([]);
  const [isRunningChaos, setIsRunningChaos] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 3. MCP Configuration state
  const [copiedMcp, setCopiedMcp] = useState(false);

  const mcpConfigJson = JSON.stringify(
    {
      mcpServers: {
        paymo: {
          command: "python",
          args: ["-m", "paymo.mcp_server"],
          env: {
            PAYMO_ENV: "sandbox",
            PAYMO_PORT: "8000",
            CASHFREE_APP_ID: "${CASHFREE_APP_ID}",
            CASHFREE_SECRET_KEY: "${CASHFREE_SECRET_KEY}",
            SARVAM_API_KEY: "${SARVAM_API_KEY}"
          }
        }
      }
    },
    null,
    2
  );

  const loadChaosHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const data = await api.getChaosHistory();
      setTestHistory(
        data.map((d) => ({
          id: d.test_id,
          scenarioName: d.scenario,
          timestamp: new Date(d.created_at).toLocaleString(),
          status: d.status,
          details: d.results
        }))
      );
    } catch {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadChaosHistory();
  }, []);

  const handleRunInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = investigateOrderId.trim();
    if (!query) return;

    setIsSearching(true);
    try {
      const txn = await api.lookupTransaction(query);
      setInvestigationResult({
        found: true,
        orderId: txn.order_id,
        details: `Correlated in SQLite backend: Txn ${txn.transaction_id}. Customer: ${txn.customer_name || 'N/A'}. Source: ${txn.source}. Channel: ${txn.payment_method}.`,
        gatewayStatus: txn.payment_status,
        merchantStatus: txn.order_status,
        rawTrace: `[BACKEND SQLITE RECORD]\nOrder: ${txn.order_id}\nTxn: ${txn.transaction_id}\nAmount: ${txn.currency} ${txn.amount}\nGateway Status: ${txn.payment_status}\nCreated: ${txn.created_at}\nDirect Cashfree Gateway Live Probe: NOT CONNECTED (Phase 3)`
      });
      showToast(`Correlated order ${txn.order_id} via FastAPI backend.`, 'info');
    } catch (err: unknown) {
      setInvestigationResult({
        found: false,
        orderId: query,
        details: `No record found in SQLite database for "${query}".`,
        rawTrace: `[LOOKUP ERROR]\nTarget: ${query}\nDetail: ${err instanceof Error ? err.message : 'Not Found'}\nStatus: UNREGISTERED`
      });
      showToast(`Order "${query}" not found in database.`, 'warn');
    } finally {
      setIsSearching(false);
    }
  };

  const handleRunChaosTest = async () => {
    const scenario = CHAOS_SCENARIOS.find((s) => s.id === selectedScenarioId) || CHAOS_SCENARIOS[0];
    setIsRunningChaos(true);

    try {
      const res = await api.runChaosTest({
        scenario_id: scenario.id,
        order_id: investigateOrderId || 'ORD_9823412'
      });

      const newResult: ChaosTestResult = {
        id: res.test_id,
        scenarioName: res.scenario,
        timestamp: new Date(res.created_at).toLocaleString(),
        status: res.status,
        details: res.results
      };

      setTestHistory((prev) => [newResult, ...prev]);
      showToast(`Chaos simulation logged to SQLite: ${scenario.name}`, 'info');
    } catch (err: unknown) {
      showToast(`Error running chaos test: ${err instanceof Error ? err.message : 'Unknown'}`, 'warn');
    } finally {
      setIsRunningChaos(false);
    }
  };

  const handleCopyMcpConfig = () => {
    navigator.clipboard.writeText(mcpConfigJson);
    setCopiedMcp(true);
    showToast('MCP JSON configuration copied to clipboard', 'success');
    setTimeout(() => setCopiedMcp(false), 2000);
  };

  return (
    <div className="space-y-8 font-mono text-white max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="border border-white p-3 bg-black flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-white shrink-0" />
          <span className="font-bold uppercase tracking-wider">
            Paymo Developer Workspace // Diagnostic & Chaos Console (FastAPI Backend)
          </span>
        </div>
        <div className="text-[11px] text-neutral-400">
          SQLITE PERSISTENCE ACTIVE // EXTERNAL CREDENTIALS EXCLUDED
        </div>
      </div>

      {/* SECTION 1: Payment Investigation */}
      <div className="border border-white bg-black p-5 space-y-4">
        <div className="border-b border-white pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">
              1. Payment Investigation
            </h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Query SQLite transaction database and inspect webhook correlation logs.
            </p>
          </div>
          <span className="text-[10px] border border-neutral-700 px-2 py-0.5 text-neutral-400">
            FASTAPI / DATABASE QUERY
          </span>
        </div>

        <form onSubmit={handleRunInvestigation} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px]">
            <Input
              label="Order ID / Transaction ID"
              placeholder="e.g. ORD_9823412 or cf_tx_90812938"
              value={investigateOrderId}
              onChange={(e) => setInvestigateOrderId(e.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            className="h-10"
            disabled={isSearching}
          >
            <Search className="w-3.5 h-3.5 mr-1.5" />
            {isSearching ? 'Querying DB...' : 'Investigate Order'}
          </Button>
        </form>

        {/* Results Panel */}
        <div className="border border-neutral-800 bg-neutral-950 p-4 space-y-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider border-b border-neutral-900 pb-1 flex justify-between">
            <span>Investigation Results Panel (Backend Telemetry)</span>
            <span>Live Cashfree PG: NOT CONNECTED (Phase 3)</span>
          </div>

          {investigationResult ? (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-neutral-400">Target Order:</span>
                <strong className="text-white">{investigationResult.orderId}</strong>
                {investigationResult.gatewayStatus && (
                  <StatusLabel status={investigationResult.gatewayStatus} type="payment" />
                )}
                {investigationResult.merchantStatus && (
                  <StatusLabel status={investigationResult.merchantStatus} type="order" />
                )}
              </div>

              <p className="text-[11px] text-neutral-300">
                {investigationResult.details}
              </p>

              <pre className="bg-black border border-neutral-800 p-3 text-[11px] text-neutral-300 overflow-x-auto whitespace-pre-wrap">
                {investigationResult.rawTrace}
              </pre>
            </div>
          ) : (
            <div className="text-neutral-500 text-xs py-3 text-center">
              Enter an Order ID above (e.g. <span className="text-white font-bold">ORD_9823412</span>) and click Investigate to query SQLite transaction records.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: Payment Chaos Lab */}
      <div className="border border-white bg-black p-5 space-y-4">
        <div className="border-b border-white pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">
              2. Payment Chaos Lab
            </h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Simulate edge-case payment failure topologies, race conditions, and corrupted webhooks.
            </p>
          </div>
          <span className="text-[10px] border border-neutral-700 px-2 py-0.5 text-neutral-400">
            SIMULATION HARNESS
          </span>
        </div>

        {/* Scenario Selector & Run */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CHAOS_SCENARIOS.map((scen) => {
              const isSelected = scen.id === selectedScenarioId;
              return (
                <div
                  key={scen.id}
                  onClick={() => setSelectedScenarioId(scen.id)}
                  className={`p-3 border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-white bg-white text-black'
                      : 'border-neutral-800 bg-neutral-950 text-white hover:border-neutral-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase">{scen.name}</span>
                    <span className="text-[10px] font-mono">
                      {isSelected ? '[SELECTED]' : '[SELECT]'}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-1 ${isSelected ? 'text-neutral-800' : 'text-neutral-400'}`}>
                    {scen.description}
                  </p>
                  <div className={`text-[10px] mt-2 font-mono ${isSelected ? 'text-black' : 'text-neutral-500'}`}>
                    Expected Discrepancy: {scen.simulatedFailure}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-neutral-400">
              Selected Scenario: <strong>{CHAOS_SCENARIOS.find(s => s.id === selectedScenarioId)?.name}</strong>
            </span>
            <Button
              variant="primary"
              onClick={handleRunChaosTest}
              disabled={isRunningChaos}
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              {isRunningChaos ? 'Executing Simulation...' : 'Run Chaos Test'}
            </Button>
          </div>
        </div>

        {/* Test History Panel */}
        <div className="border border-neutral-800 bg-neutral-950 p-4 space-y-3">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider border-b border-neutral-900 pb-1 flex justify-between items-center">
            <span>Chaos Test Execution History ({testHistory.length})</span>
            <button
              onClick={loadChaosHistory}
              disabled={isLoadingHistory}
              className="text-neutral-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              <span>[RELOAD]</span>
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {testHistory.length === 0 ? (
              <div className="text-neutral-500 text-xs py-2 text-center">
                No chaos simulation records yet. Click 'Run Chaos Test' above.
              </div>
            ) : (
              testHistory.map((th) => (
                <div key={th.id} className="border border-neutral-800 bg-black p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-white">{th.scenarioName}</span>
                    <span className="text-neutral-500">{th.timestamp}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] border border-white px-1.5 py-0.5 text-white bg-black">
                      [{th.status}]
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 pt-1">
                    {th.details}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3: Paymo MCP */}
      <div className="border border-white bg-black p-5 space-y-4">
        <div className="border-b border-white pb-2 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider">
              3. Paymo MCP (Model Context Protocol)
            </h2>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Protocol interface exposing Payment Sentinel tools to coding agents and AI coordinators.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] border border-white px-2 py-0.5 text-white bg-black font-semibold">
              SERVER: OFFLINE (PHASE 3)
            </span>
          </div>
        </div>

        {/* MCP Tools Specification List */}
        <div className="space-y-2">
          <div className="text-[10px] text-neutral-400 uppercase tracking-wider">
            Exposed Model Context Tools (Frontend Specification)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MCP_TOOLS.map((tool) => (
              <div key={tool.name} className="border border-neutral-800 p-3 bg-neutral-950 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-mono">{tool.name}()</span>
                  <span className="text-[10px] text-neutral-400 border border-neutral-700 px-1 py-0.5">
                    {tool.status}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  {tool.description}
                </p>
                <div className="text-[10px] text-neutral-500 font-mono pt-1">
                  Schema: <code className="text-neutral-300">{tool.parameters}</code>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Setup Instructions & Configuration Box */}
        <div className="border border-neutral-800 bg-neutral-950 p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                MCP Client Configuration (mcpServers)
              </span>
              <p className="text-[10px] text-neutral-400">
                Add this block to your agent configuration file once the backend FastMCP server is active.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyMcpConfig}
            >
              {copiedMcp ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copiedMcp ? 'Copied' : 'Copy Configuration'}
            </Button>
          </div>

          <pre className="bg-black border border-neutral-800 p-3 text-[11px] text-neutral-300 overflow-x-auto">
            {mcpConfigJson}
          </pre>

          <div className="text-[11px] text-neutral-400 flex items-start gap-2 border-t border-neutral-900 pt-2">
            <AlertTriangle className="w-4 h-4 text-white shrink-0 mt-0.5" />
            <span>
              <strong>STATUS SPECIFICATION:</strong> The MCP server URL is not yet bound to a live process. Do not attempt to run live agent queries against port 8000 until the FastAPI daemon is initialized in Phase 3.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
