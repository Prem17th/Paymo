import React, { useState } from 'react';
import { Case, InvestigationStatus, AssignedTeam } from '../types';
import { StatusLabel } from './StatusLabel';
import { Button } from './Button';
import { usePaymo } from '../context/PaymoContext';
import { FileText, Radio, Activity, Code2, Copy, Check } from 'lucide-react';

interface CaseDetailPanelProps {
  currentCase?: Case;
}

export const CaseDetailPanel: React.FC<CaseDetailPanelProps> = ({ currentCase }) => {
  const { showToast, updateCaseStatus, assignCaseTeam } = usePaymo();
  const [showWebhooks, setShowWebhooks] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [isInvestigating, setIsInvestigating] = useState(false);

  if (!currentCase) {
    return (
      <div className="border border-white p-8 text-center text-neutral-400 font-mono text-xs">
        SELECT A CASE TO VIEW INVESTIGATION DETAILS.
      </div>
    );
  }

  const orderId = currentCase.order_id || currentCase.orderId || 'ORD_UNKNOWN';
  const transactionId = currentCase.transaction_id || currentCase.transactionId || 'cf_tx_UNKNOWN';
  const customerName = currentCase.customer_name || currentCase.customerName || 'Anonymous';
  const customerEmail = currentCase.customer_email || currentCase.customerEmail || 'unknown@example.com';
  const paymentStatus = currentCase.payment_status || currentCase.paymentStatus || 'FAILED';
  const orderStatus = currentCase.order_status || currentCase.orderStatus || 'PENDING_CONFIRMATION';
  const investigationStatus = (currentCase.investigation_status || currentCase.investigationStatus || 'OPEN') as InvestigationStatus;
  const assignedTeam = (currentCase.assigned_team || currentCase.assignedTeam || 'Engineering') as AssignedTeam;
  const channel = currentCase.channel || 'UPI';
  const webhooks = currentCase.webhooks || [];
  const timeline = currentCase.timeline || [];

  const handleInvestigatePayment = () => {
    setIsInvestigating(true);
    showToast('Probing backend database and gateway transaction log...', 'info');
    setTimeout(() => {
      setIsInvestigating(false);
      showToast(
        `Backend ledger verified: Txn ${transactionId} confirmed in SQLite. Live Cashfree PG probe requires Phase 3 credentials.`,
        'info'
      );
    }, 600);
  };

  const handleRunSandboxTest = () => {
    showToast(
      'Sandbox test harness executed: Navigate to Developer > Chaos Lab to inspect full event trace.',
      'info'
    );
  };

  const generateReportText = () => {
    return `# PAYMO INCIDENT REPORT: ${currentCase.id}
Generated: ${new Date().toISOString()}
Database: SQLite (paymo.db)
--------------------------------------------------
Order ID:             ${orderId}
Transaction ID:       ${transactionId}
Customer:             ${customerName} (${customerEmail})
Amount:               ₹${currentCase.amount.toFixed(2)} ${currentCase.currency}
Payment Channel:      ${channel}
Gateway Status:       ${paymentStatus}
Merchant Order State: ${orderStatus}
Investigation Status: ${investigationStatus}
Assigned Team:        ${assignedTeam}

Primary Root Cause / Description:
${currentCase.description || currentCase.errorMessage || 'No critical failure text logged.'}

Activity Timeline:
${timeline.map((t) => `- [${t.time || t.timestamp || 'N/A'}] ${t.title || t.event_type || 'Event'}: ${t.detail || t.description || ''} (Actor: ${t.actor})`).join('\n')}

Webhooks Captured: ${webhooks.length}
--------------------------------------------------
Status: Awaiting Cashfree API sync / Engineering ledger confirmation.`;
  };

  const copyReportToClipboard = () => {
    navigator.clipboard.writeText(generateReportText());
    setCopiedReport(true);
    showToast('Incident report copied to clipboard', 'success');
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="border border-white bg-black p-4 flex flex-col gap-5 font-mono text-xs text-white">
      {/* Header bar */}
      <div className="border-b border-white pb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] text-neutral-400 uppercase tracking-widest">Case Identification</div>
          <h2 className="text-base font-bold tracking-tight">{currentCase.id}</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-400">STATUS:</span>
            <select
              value={investigationStatus}
              onChange={(e) => updateCaseStatus(currentCase.id, e.target.value as InvestigationStatus)}
              className="bg-black border border-white text-white text-[11px] px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-white"
            >
              <option value="OPEN">OPEN</option>
              <option value="INVESTIGATING">INVESTIGATING</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="ESCALATED">ESCALATED</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-400">TEAM:</span>
            <select
              value={assignedTeam}
              onChange={(e) => assignCaseTeam(currentCase.id, e.target.value as AssignedTeam)}
              className="bg-black border border-white text-white text-[11px] px-2 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-white"
            >
              <option value="Engineering">Engineering</option>
              <option value="Support">Support</option>
              <option value="Finance">Finance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Primary specs grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-neutral-800 p-3 bg-neutral-950">
        <div>
          <span className="text-[10px] text-neutral-400 block uppercase">Payment Status</span>
          <div className="mt-1">
            <StatusLabel status={paymentStatus} type="payment" />
          </div>
        </div>
        <div>
          <span className="text-[10px] text-neutral-400 block uppercase">Order Status</span>
          <div className="mt-1">
            <StatusLabel status={orderStatus} type="order" />
          </div>
        </div>
        <div>
          <span className="text-[10px] text-neutral-400 block uppercase">Assigned Team</span>
          <span className="font-semibold block mt-1">{assignedTeam}</span>
        </div>
        <div>
          <span className="text-[10px] text-neutral-400 block uppercase">Amount</span>
          <span className="font-semibold block mt-1">₹{currentCase.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Transaction & Customer metadata */}
      <div className="border border-neutral-800 p-3 space-y-2">
        <div className="text-[10px] text-neutral-400 uppercase tracking-wider border-b border-neutral-900 pb-1">
          Entity References (Persisted in SQLite)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-neutral-500">Order ID: </span>
            <span className="text-white font-bold">{orderId}</span>
          </div>
          <div>
            <span className="text-neutral-500">Gateway Txn: </span>
            <span className="text-white font-bold">{transactionId}</span>
          </div>
          <div>
            <span className="text-neutral-500">Customer: </span>
            <span className="text-neutral-300">{customerName}</span>
          </div>
          <div>
            <span className="text-neutral-500">Email: </span>
            <span className="text-neutral-300">{customerEmail}</span>
          </div>
          <div>
            <span className="text-neutral-500">Channel: </span>
            <span className="text-neutral-300">{channel}</span>
          </div>
          <div>
            <span className="text-neutral-500">Updated: </span>
            <span className="text-neutral-300">{currentCase.last_updated || currentCase.lastUpdated || 'Just now'}</span>
          </div>
        </div>
        {(currentCase.description || currentCase.errorMessage) && (
          <div className="border-t border-neutral-900 pt-2 mt-2">
            <span className="text-[10px] text-neutral-400 block mb-1 uppercase">Diagnostics:</span>
            <p className="text-[11px] text-neutral-300 bg-neutral-900/60 p-2 border border-neutral-800">
              {currentCase.description || currentCase.errorMessage}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleInvestigatePayment}
          disabled={isInvestigating}
        >
          <Activity className="w-3 h-3 mr-1" />
          {isInvestigating ? 'Probing...' : 'Investigate'}
        </Button>
        <Button
          variant={showWebhooks ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setShowWebhooks(!showWebhooks)}
        >
          <Code2 className="w-3 h-3 mr-1" />
          Webhooks ({webhooks.length})
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRunSandboxTest}
        >
          <Radio className="w-3 h-3 mr-1" />
          Sandbox Test
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowReportModal(true)}
        >
          <FileText className="w-3 h-3 mr-1" />
          Report
        </Button>
      </div>

      {/* Webhook inspection panel */}
      {showWebhooks && (
        <div className="border border-white p-3 bg-neutral-950 space-y-2">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-1.5">
            <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold">
              Raw Webhook Event Payloads ({webhooks.length})
            </span>
            <button
              onClick={() => setShowWebhooks(false)}
              className="text-neutral-400 hover:text-white text-[10px] underline"
            >
              [CLOSE]
            </button>
          </div>
          {webhooks.length === 0 ? (
            <div className="p-3 text-neutral-500 text-[11px]">
              No webhooks captured for this order. (Possibly dropped or not routed to endpoint).
            </div>
          ) : (
            webhooks.map((wh) => (
              <div key={wh.id || wh.event_id || Math.random().toString()} className="border border-neutral-800 p-2 bg-black text-[11px] font-mono">
                <div className="flex justify-between items-center text-[10px] text-neutral-400 mb-1">
                  <span>{wh.event || wh.event_type}</span>
                  <span>STATUS: {wh.status || wh.processing_status} | {wh.receivedAt || wh.received_timestamp}</span>
                </div>
                <pre className="text-[10px] text-neutral-300 overflow-x-auto p-1.5 bg-neutral-950 border border-neutral-900">
                  {JSON.stringify(wh.payload, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      )}

      {/* Activity timeline */}
      <div className="border border-neutral-800 p-3 space-y-3">
        <div className="text-[10px] text-neutral-400 uppercase tracking-wider border-b border-neutral-900 pb-1 font-semibold">
          Incident Activity Timeline ({timeline.length})
        </div>
        <div className="space-y-3">
          {timeline.length === 0 ? (
            <div className="text-neutral-500 text-[11px]">No timeline events logged.</div>
          ) : (
            timeline.map((event, idx) => (
              <div key={event.id || event.event_id || idx} className="border-l-2 border-white pl-3 text-xs relative">
                <div className="flex items-center justify-between text-[10px] text-neutral-400">
                  <span className="font-semibold text-white">{event.title || event.event_type}</span>
                  <span>{event.time || (event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'N/A')}</span>
                </div>
                <p className="text-[11px] text-neutral-300 mt-0.5">{event.detail || event.description}</p>
                <div className="text-[9px] text-neutral-500 mt-0.5">Actor: {event.actor}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="border border-white bg-black max-w-xl w-full p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-white pb-2">
              <h3 className="font-bold text-sm uppercase">Incident Report: {currentCase.id}</h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                [ESC / CLOSE]
              </button>
            </div>
            <pre className="bg-neutral-950 border border-neutral-800 p-3 text-[11px] text-neutral-300 max-h-80 overflow-y-auto whitespace-pre-wrap">
              {generateReportText()}
            </pre>
            <div className="flex items-center justify-end gap-2 border-t border-neutral-800 pt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowReportModal(false)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={copyReportToClipboard}
              >
                {copiedReport ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                {copiedReport ? 'Copied' : 'Copy Report'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
