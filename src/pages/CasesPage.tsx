import React, { useState, useEffect } from 'react';
import { usePaymo } from '../context/PaymoContext';
import { CaseTable } from '../components/CaseTable';
import { CaseDetailPanel } from '../components/CaseDetailPanel';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Plus, Search, Filter, X, RefreshCw } from 'lucide-react';
import { PaymentStatus, OrderStatus, AssignedTeam } from '../types';

export const CasesPage: React.FC = () => {
  const { cases, selectedCaseId, selectedCase, selectCase, createCase, fetchCases, isLoading, error } = usePaymo();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');

  // Trigger search on backend
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCases({
        search: searchQuery,
        status: statusFilter,
        team: teamFilter
      });
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery, statusFilter, teamFilter, fetchCases]);

  // Create Incident Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newOrder, setNewOrder] = useState({
    orderId: '',
    transactionId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    amount: '',
    channel: 'UPI' as 'UPI' | 'Cards' | 'Netbanking' | 'Wallet',
    paymentStatus: 'FAILED' as PaymentStatus,
    orderStatus: 'PENDING_CONFIRMATION' as OrderStatus,
    assignedTeam: 'Engineering' as AssignedTeam,
    errorMessage: ''
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await createCase({
      orderId: newOrder.orderId || `ORD_${Math.floor(1000000 + Math.random() * 9000000)}`,
      transactionId: newOrder.transactionId || `cf_tx_${Math.floor(10000000 + Math.random() * 90000000)}`,
      customerName: newOrder.customerName || 'Anonymous Customer',
      customerEmail: newOrder.customerEmail || 'customer@example.com',
      customerPhone: newOrder.customerPhone || '+91 99000 00000',
      amount: parseFloat(newOrder.amount) || 1999.00,
      paymentStatus: newOrder.paymentStatus,
      orderStatus: newOrder.orderStatus,
      assignedTeam: newOrder.assignedTeam,
      channel: newOrder.channel,
      errorMessage: newOrder.errorMessage || 'Manually logged discrepancy from Paymo Resolve interface.'
    });

    setIsSubmitting(false);
    setIsCreateModalOpen(false);
    // Reset form
    setNewOrder({
      orderId: '',
      transactionId: '',
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      amount: '',
      channel: 'UPI',
      paymentStatus: 'FAILED',
      orderStatus: 'PENDING_CONFIRMATION',
      assignedTeam: 'Engineering',
      errorMessage: ''
    });
  };

  return (
    <div className="space-y-4 font-mono text-white max-w-7xl mx-auto">
      {/* Top Workspace Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white pb-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Paymo Resolve // Case Management Workspace
          </h2>
          <span className="text-[11px] text-neutral-400">
            Real-time discrepancy triage and payment gateway correlation (SQLite Database)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchCases({ search: searchQuery, status: statusFilter, team: teamFilter })}
            className="text-neutral-400 hover:text-white flex items-center gap-1 focus:outline-none"
            title="Reload from backend"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="text-xs">[RELOAD]</span>
          </button>
          <Button
            variant="primary"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create Incident
          </Button>
        </div>
      </div>

      {error && (
        <div className="border border-white p-3 bg-neutral-900 text-xs text-white">
          [API WARNING]: {error}. Displaying local state fallback if available.
        </div>
      )}

      {/* Two-Column Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Filter Controls & Case Table (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {/* Controls Bar */}
          <div className="border border-white p-3 bg-black space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Case, Order, Txn ID or Customer..."
                className="w-full bg-neutral-950 border border-neutral-700 pl-9 pr-3 py-2 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-white focus:ring-1 focus:ring-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-neutral-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Filter className="w-3 h-3 text-neutral-400" />
                <span className="text-[10px] text-neutral-400 uppercase">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-black border border-white text-white text-[11px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white"
                >
                  <option value="ALL">ALL STATUSES</option>
                  <option value="OPEN">OPEN</option>
                  <option value="INVESTIGATING">INVESTIGATING</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="ESCALATED">ESCALATED</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-neutral-400 uppercase">Team:</span>
                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="bg-black border border-white text-white text-[11px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white"
                >
                  <option value="ALL">ALL TEAMS</option>
                  <option value="Engineering">ENGINEERING</option>
                  <option value="Support">SUPPORT</option>
                  <option value="Finance">FINANCE</option>
                </select>
              </div>

              <div className="text-[10px] text-neutral-400 ml-auto">
                {isLoading ? 'FETCHING FROM SQLITE...' : `SHOWING: ${cases.length}`}
              </div>
            </div>
          </div>

          {/* Cases Table */}
          {isLoading && cases.length === 0 ? (
            <div className="border border-white p-6 text-center text-xs font-mono text-neutral-400">
              QUERYING CASES FROM BACKEND...
            </div>
          ) : (
            <CaseTable
              cases={cases}
              selectedCaseId={selectedCaseId}
              onSelectCase={selectCase}
              compact={true}
            />
          )}
        </div>

        {/* Right Column: Case Detail Panel (5 cols) */}
        <div className="lg:col-span-5 sticky top-20">
          <CaseDetailPanel currentCase={selectedCase} />
        </div>
      </div>

      {/* Create Incident Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="border border-white bg-black max-w-lg w-full p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-white pb-2">
              <h3 className="font-bold text-sm uppercase">Create Payment Incident</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                [CLOSE]
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Order ID"
                  placeholder="e.g. ORD_9823901"
                  value={newOrder.orderId}
                  onChange={(e) => setNewOrder({ ...newOrder, orderId: e.target.value })}
                  required
                />
                <Input
                  label="Transaction ID"
                  placeholder="e.g. cf_tx_90812999"
                  value={newOrder.transactionId}
                  onChange={(e) => setNewOrder({ ...newOrder, transactionId: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Customer Name"
                  placeholder="Full Name"
                  value={newOrder.customerName}
                  onChange={(e) => setNewOrder({ ...newOrder, customerName: e.target.value })}
                  required
                />
                <Input
                  label="Customer Email"
                  placeholder="name@example.com"
                  type="email"
                  value={newOrder.customerEmail}
                  onChange={(e) => setNewOrder({ ...newOrder, customerEmail: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Amount (INR)"
                  placeholder="2499.00"
                  type="number"
                  step="0.01"
                  value={newOrder.amount}
                  onChange={(e) => setNewOrder({ ...newOrder, amount: e.target.value })}
                  required
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider font-mono text-neutral-400 font-semibold">
                    Payment Channel
                  </label>
                  <select
                    value={newOrder.channel}
                    onChange={(e) => setNewOrder({ ...newOrder, channel: e.target.value as 'UPI' | 'Cards' | 'Netbanking' | 'Wallet' })}
                    className="bg-black border border-white text-white px-3 py-2 text-xs font-mono focus:outline-none"
                  >
                    <option value="UPI">UPI (NPCI / PSP)</option>
                    <option value="Cards">Credit / Debit Card</option>
                    <option value="Netbanking">Netbanking</option>
                    <option value="Wallet">Digital Wallet</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider font-mono text-neutral-400 font-semibold">
                    Gateway Status
                  </label>
                  <select
                    value={newOrder.paymentStatus}
                    onChange={(e) => setNewOrder({ ...newOrder, paymentStatus: e.target.value as PaymentStatus })}
                    className="bg-black border border-white text-white px-3 py-2 text-xs font-mono focus:outline-none"
                  >
                    <option value="FAILED">FAILED</option>
                    <option value="CHARGED">CHARGED (DEBITED)</option>
                    <option value="PENDING">PENDING</option>
                    <option value="SUCCESS">SUCCESS</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider font-mono text-neutral-400 font-semibold">
                    Assigned Team
                  </label>
                  <select
                    value={newOrder.assignedTeam}
                    onChange={(e) => setNewOrder({ ...newOrder, assignedTeam: e.target.value as AssignedTeam })}
                    className="bg-black border border-white text-white px-3 py-2 text-xs font-mono focus:outline-none"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Support">Support</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs uppercase tracking-wider font-mono text-neutral-400 font-semibold">
                  Incident Diagnostics / Notes
                </label>
                <textarea
                  rows={3}
                  value={newOrder.errorMessage}
                  onChange={(e) => setNewOrder({ ...newOrder, errorMessage: e.target.value })}
                  placeholder="Describe failure discrepancy (e.g. Webhook delivery 504 timeout after bank capture)..."
                  className="bg-black border border-white text-white px-3 py-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Persisting to DB...' : 'Save to SQLite Database'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
