import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePaymo } from '../context/PaymoContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { StatusLabel } from '../components/StatusLabel';
import { api } from '../lib/api';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Clock,
  Users,
  Upload,
  Trash2
} from 'lucide-react';

interface PaymentHistoryItem {
  transaction_id: string;
  order_id: string;
  amount: number;
  currency: string;
  payment_status: string;
  order_status: string;
  source: string;
  payment_method: string;
  customer_name?: string;
  customer_email?: string;
  created_at: string;
}

interface CashfreeInstance {
  checkout: (opts: { paymentSessionId: string; redirectTarget?: string }) => Promise<{ error?: { message: string } }>;
}

interface Contact {
  name: string;
  phone: string;
}

export const PaymentsPage: React.FC = () => {
  const { showToast } = usePaymo();
  const [searchParams] = useSearchParams();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Form states - empty defaults (no prefilled values)
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');

  // Contacts - persistent from SQLite, empty by default
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState<boolean>(false);
  const [payoutNotice, setPayoutNotice] = useState<string | null>(null);

  // Loading and action states
  const [isCreatingOrder, setIsCreatingOrder] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);

  // Verification result modal state
  const [verifiedResult, setVerifiedResult] = useState<{
    order_id: string;
    transaction_id: string;
    amount: number;
    currency: string;
    payment_status: string;
    order_status: string;
    payment_method: string;
    verified_by: string;
  } | null>(null);

  // Cashfree SDK loader
  const loadSdk = async (): Promise<CashfreeInstance> => {
    const win = window as unknown as { Cashfree?: (opts: { mode: string }) => CashfreeInstance };
    if (win.Cashfree) {
      return win.Cashfree({ mode: 'sandbox' });
    }
    return new Promise<CashfreeInstance>((resolve, reject) => {
      const existing = document.getElementById('cashfree-sdk-script');
      if (existing) {
        existing.onload = () => {
          if (win.Cashfree) resolve(win.Cashfree({ mode: 'sandbox' }));
        };
        return;
      }
      const script = document.createElement('script');
      script.id = 'cashfree-sdk-script';
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.onload = () => {
        try {
          if (win.Cashfree) resolve(win.Cashfree({ mode: 'sandbox' }));
          else reject(new Error('Cashfree SDK object not found on window'));
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = () => reject(new Error('Failed to load Cashfree JS SDK'));
      document.body.appendChild(script);
    });
  };

  const fetchContacts = async () => {
    try {
      setLoadingContacts(true);
      const data = await api.getContacts();
      setContacts(data.map((c) => ({ name: c.name, phone: c.phone })));
    } catch {
      // ignore
    } finally {
      setLoadingContacts(false);
    }
  };

  const fetchPayments = async () => {
    try {
      setLoadingHistory(true);
      const data = await api.getPayments(50);
      setPayments(data);
    } catch (err: unknown) {
      showToast(`Error fetching payments: ${err instanceof Error ? err.message : 'API offline'}`, 'warn');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchContacts();

    const orderIdParam = searchParams.get('order_id');
    if (orderIdParam) {
      verifyOrder(orderIdParam);
    }

    return () => {
      stopPolling();
    };
  }, [searchParams]);

  const verifyOrder = async (orderId: string) => {
    setIsVerifying(true);
    try {
      const res = await api.verifyPayment(orderId);
      setVerifiedResult(res);
      if (res.payment_status === 'SUCCESS') {
        showToast(`Payment for ${orderId} verified: SUCCESS!`, 'success');
      } else if (res.payment_status === 'PENDING') {
        showToast(`Payment for ${orderId} is PENDING in Cashfree Sandbox.`, 'info');
      } else {
        showToast(`Payment status: ${res.payment_status}`, 'warn');
      }
      fetchPayments();
      return res;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Verification failed';
      showToast(`Verification error: ${errMsg}`, 'warn');
      return null;
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePayNow = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      showToast('Please enter a valid amount greater than ₹0.', 'warn');
      return;
    }

    setIsCreatingOrder(true);
    setVerifiedResult(null);

    try {
      const res = await api.createPaymentOrder({
        amount: numericAmount,
        description: description.trim() || 'Paymo Payment Order',
        customer_name: customerName.trim() || undefined,
        customer_email: customerEmail.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
      });

      if (!res.payment_session_id) {
        showToast('Order created, but payment_session_id is unavailable.', 'warn');
        return;
      }

      showToast(`Sandbox order ${res.order_id} created. Initializing checkout...`, 'info');

      const cashfree = await loadSdk();
      await cashfree.checkout({
        paymentSessionId: res.payment_session_id,
        redirectTarget: '_modal',
      });

      // Poll briefly (every 3s up to 6 times) while modal is active
      stopPolling();
      let pollCount = 0;
      pollIntervalRef.current = window.setInterval(async () => {
        pollCount += 1;
        const result = await verifyOrder(res.order_id);
        if (result?.payment_status === 'SUCCESS' || result?.payment_status === 'FAILED' || pollCount >= 6) {
          stopPolling();
        }
      }, 3000);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to launch Cashfree sandbox checkout';
      showToast(`Payment Error: ${errMsg}`, 'warn');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // CSV Contacts Importer (Persists directly to SQLite)
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const imported: Contact[] = [];

      for (const line of lines) {
        // Skip header if line contains "name"
        if (line.toLowerCase().includes('name') && line.toLowerCase().includes('phone')) continue;
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length >= 2 && parts[0] && parts[1]) {
          imported.push({
            name: parts[0],
            phone: parts[1],
          });
        }
      }

      if (imported.length > 0) {
        try {
          const res = await api.importContacts(imported);
          setContacts(res.map((c) => ({ name: c.name, phone: c.phone })));
          showToast(`Imported and saved ${imported.length} contacts to database.`, 'success');
        } catch (err) {
          showToast(`Failed to persist contacts: ${err instanceof Error ? err.message : 'Error'}`, 'warn');
        }
      } else {
        showToast('No valid contacts found in CSV. Expected format: Name, Phone', 'warn');
      }
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  // Clear Contacts Permanently
  const handleClearContacts = async () => {
    if (!window.confirm('Are you sure you want to permanently clear all contacts from the directory?')) {
      return;
    }
    try {
      await api.clearContacts();
      setContacts([]);
      showToast('All contacts cleared from database.', 'info');
    } catch (err) {
      showToast(`Failed to clear contacts: ${err instanceof Error ? err.message : 'Error'}`, 'warn');
    }
  };

  const handleSelectContact = (c: Contact) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setPayoutNotice(null);
    showToast(`Selected contact: ${c.name}`, 'info');
  };

  const handleAttemptTransfer = () => {
    setPayoutNotice('Transfers to contacts require Cashfree Payouts. Direct money transfers cannot be performed using merchant collection gateway credentials.');
  };

  return (
    <div className="space-y-6 font-mono text-white max-w-6xl mx-auto select-none">
      {/* Header */}
      <div className="border-b border-white pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-wider">
            Payments
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Create payment orders, launch sandbox checkout, and verify transactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchPayments}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loadingHistory ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Verified Status Modal / Banner */}
      {verifiedResult && (
        <div className="border border-white bg-black p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-white" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Cashfree Verified Status
              </span>
            </div>
            <button
              onClick={() => setVerifiedResult(null)}
              className="text-[11px] text-neutral-400 hover:text-white uppercase"
            >
              [Dismiss]
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="border border-neutral-800 p-2 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Order ID</span>
              <span className="font-bold text-white block mt-0.5">{verifiedResult.order_id}</span>
            </div>
            <div className="border border-neutral-800 p-2 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Amount</span>
              <span className="font-bold text-white block mt-0.5">₹{verifiedResult.amount.toFixed(2)}</span>
            </div>
            <div className="border border-neutral-800 p-2 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Payment Status</span>
              <div className="mt-0.5">
                <StatusLabel status={verifiedResult.payment_status} type="payment" />
              </div>
            </div>
            <div className="border border-neutral-800 p-2 bg-neutral-950">
              <span className="text-[10px] text-neutral-400 block uppercase">Verified By</span>
              <span className="font-bold text-white block mt-0.5">{verifiedResult.verified_by}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Payment Form + Contact Import */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Form (2 Cols) */}
        <div className="lg:col-span-2 border border-white bg-black p-5 space-y-4">
          <div className="border-b border-white pb-2 flex items-center justify-between">
            <h2 className="text-xs uppercase font-bold tracking-wider flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-white" />
              <span>Make a Payment (Cashfree Sandbox)</span>
            </h2>
            <span className="text-[10px] text-neutral-400">
              INR (₹)
            </span>
          </div>

          <form onSubmit={handlePayNow} className="space-y-4 text-xs">
            {/* Quick Amount Selectors */}
            <div>
              <label className="block text-[11px] text-neutral-400 uppercase mb-1.5">
                Quick Select Amount
              </label>
              <div className="grid grid-cols-4 gap-2 font-mono">
                {['10.00', '100.00', '500.00', '2500.00'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmount(preset)}
                    className={`border px-2 py-1.5 text-center text-xs ${
                      amount === preset
                        ? 'bg-white text-black font-bold border-white'
                        : 'bg-black text-white border-neutral-700 hover:border-white'
                    }`}
                  >
                    ₹{preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount */}
            <div>
              <label className="block text-[11px] text-neutral-400 uppercase mb-1">
                Amount (INR) <span className="text-white">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (e.g. 10.00)"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] text-neutral-400 uppercase mb-1">
                Payment Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional order description"
              />
            </div>

            {/* Customer Details (Empty by default) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-900">
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                  Customer Name
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                  Customer Email
                </label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 uppercase mb-1">
                  Customer Phone
                </label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="9999999999"
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                disabled={isCreatingOrder || isVerifying || !amount}
                className="py-3 text-xs tracking-wider uppercase font-bold"
              >
                {isCreatingOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span>Creating Order...</span>
                  </>
                ) : isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span>Verifying with Cashfree...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    <span>Pay {amount ? `₹${parseFloat(amount).toFixed(2)}` : ''} Now</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>

        {/* Right Col: Contact Import & Directory */}
        <div className="border border-white bg-black p-5 flex flex-col justify-between space-y-4 text-xs">
          <div className="space-y-3">
            <div className="border-b border-white pb-2 flex items-center justify-between">
              <h3 className="text-xs uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-white" />
                <span>Contact Directory</span>
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="text-[10px] border border-neutral-700 hover:border-white px-2 py-0.5 text-neutral-300 hover:text-white flex items-center gap-1"
                  title="Import CSV with Name, Phone"
                >
                  <Upload className="w-3 h-3" />
                  <span>Import CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearContacts}
                  className="text-[10px] border border-neutral-800 hover:border-neutral-500 px-2 py-0.5 text-neutral-400 hover:text-white flex items-center gap-1"
                  title="Clear all contacts permanently from database"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Contacts</span>
                </button>
              </div>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvImport}
                className="hidden"
              />
            </div>

            <p className="text-[10px] text-neutral-400">
              Select a contact to fill payment recipient details.
            </p>

            {/* Payout Notice Warning Banner */}
            {payoutNotice && (
              <div className="border border-white p-2.5 bg-neutral-900 text-[10px] leading-relaxed text-white space-y-1">
                <div className="flex items-center gap-1 font-bold text-neutral-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-white" />
                  <span>PAYOUT RESTRICTION</span>
                </div>
                <div>{payoutNotice}</div>
              </div>
            )}

            {/* Contacts Table */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {loadingContacts ? (
                <div className="border border-neutral-800 p-4 text-center text-[11px] text-neutral-500">
                  Loading contacts...
                </div>
              ) : contacts.length === 0 ? (
                <div className="border border-neutral-800 p-4 text-center text-[11px] text-neutral-500">
                  No contacts yet. Import a CSV to get started.
                </div>
              ) : (
                contacts.map((c, i) => (
                  <div
                    key={i}
                    className="border border-neutral-800 p-2 bg-neutral-950 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <span className="font-bold text-white block">{c.name}</span>
                      <span className="text-neutral-400 text-[10px]">{c.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectContact(c)}
                        className="border border-neutral-700 hover:border-white px-2 py-0.5 text-[10px] text-neutral-300 hover:text-white"
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        onClick={handleAttemptTransfer}
                        className="border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500 hover:text-neutral-300"
                        title="Direct transfers require Cashfree Payouts"
                      >
                        Transfer
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="text-[10px] text-neutral-500 border-t border-neutral-900 pt-2">
            Notice: Cashfree Payment Gateway is for merchant collection. Direct transfers to contacts require Cashfree Payouts.
          </div>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="border border-white bg-black p-5 space-y-4">
        <div className="border-b border-white pb-2 flex items-center justify-between">
          <h2 className="text-xs uppercase font-bold tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-white" />
            <span>Verified Payment History (SQLite)</span>
          </h2>
          <span className="text-[10px] text-neutral-400">
            {payments.length} RECORDS
          </span>
        </div>

        {loadingHistory ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            Loading payment telemetry from database...
          </div>
        ) : payments.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            No payments recorded yet. Initiate a payment above to see records.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white text-[10px] uppercase text-neutral-400 font-mono">
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 font-mono">
                {payments.map((p) => (
                  <tr key={p.transaction_id || p.order_id} className="hover:bg-neutral-950">
                    <td className="py-2.5 px-3 font-bold text-white">
                      {p.order_id}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-white">
                      ₹{p.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusLabel status={p.payment_status} type="payment" />
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400">
                      {p.payment_method}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="border border-neutral-700 px-1.5 py-0.5 text-[9px] uppercase text-neutral-300">
                        {p.source}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-400 text-[10px]">
                      {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => verifyOrder(p.order_id)}
                        className="border border-neutral-700 hover:border-white px-2 py-0.5 text-[10px] text-neutral-300 hover:text-white uppercase"
                        title="Re-verify with Cashfree"
                      >
                        Verify
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
