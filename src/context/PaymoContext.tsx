import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Case, PaymentStatus, OrderStatus, InvestigationStatus, AssignedTeam } from '../types';
import { api } from '../lib/api';

interface Toast {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warn';
}

interface PaymoContextType {
  cases: Case[];
  selectedCaseId: string;
  selectedCase: Case | undefined;
  isLoading: boolean;
  error: string | null;
  toasts: Toast[];
  showToast: (message: string, type?: 'info' | 'success' | 'warn') => void;
  removeToast: (id: string) => void;
  selectCase: (id: string) => void;
  fetchCases: (filters?: { search?: string; status?: string; team?: string }) => Promise<void>;
  createCase: (data: {
    orderId: string;
    transactionId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    amount: number;
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
    assignedTeam: AssignedTeam;
    channel: 'UPI' | 'Cards' | 'Netbanking' | 'Wallet';
    errorMessage?: string;
  }) => Promise<Case | null>;
  updateCaseStatus: (id: string, investigationStatus: InvestigationStatus) => Promise<void>;
  assignCaseTeam: (id: string, team: AssignedTeam) => Promise<void>;
}

const PaymoContext = createContext<PaymoContextType | undefined>(undefined);

export const PaymoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('CASE-2024-8831');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'info' | 'success' | 'warn' = 'info') => {
    const id = 'toast_' + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchCases = useCallback(async (filters?: { search?: string; status?: string; team?: string }) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getCases({
        search: filters?.search,
        status: filters?.status,
        team: filters?.team
      });
      setCases(data);
      if (data.length > 0 && !data.some((c) => c.id === selectedCaseId)) {
        setSelectedCaseId(data[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to Paymo backend API';
      setError(msg);
      showToast(`Backend connection notice: ${msg}`, 'warn');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    fetchCases();
  }, []);

  const selectCase = (id: string) => {
    setSelectedCaseId(id);
  };

  const createCase = async (data: {
    orderId: string;
    transactionId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    amount: number;
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
    assignedTeam: AssignedTeam;
    channel: 'UPI' | 'Cards' | 'Netbanking' | 'Wallet';
    errorMessage?: string;
  }): Promise<Case | null> => {
    try {
      const newCase = await api.createCase({
        order_id: data.orderId,
        transaction_id: data.transactionId,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone,
        amount: data.amount,
        payment_status: data.paymentStatus,
        order_status: data.orderStatus,
        assigned_team: data.assignedTeam,
        channel: data.channel,
        issue_type: data.paymentStatus,
        description: data.errorMessage
      });

      setCases((prev) => [newCase, ...prev]);
      setSelectedCaseId(newCase.id);
      showToast(`Case ${newCase.id} created and persisted in SQLite`, 'success');
      return newCase;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create case in backend';
      showToast(`Error creating case: ${msg}`, 'warn');
      return null;
    }
  };

  const updateCaseStatus = async (id: string, investigationStatus: InvestigationStatus) => {
    try {
      const updated = await api.updateCaseStatus(id, investigationStatus);
      setCases((prev) => prev.map((c) => (c.id === id ? updated : c)));
      showToast(`Case ${id} updated to ${investigationStatus} (persisted in DB)`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update case status';
      showToast(`Error updating status: ${msg}`, 'warn');
    }
  };

  const assignCaseTeam = async (id: string, team: AssignedTeam) => {
    try {
      const updated = await api.assignCase(id, team);
      setCases((prev) => prev.map((c) => (c.id === id ? updated : c)));
      showToast(`Case ${id} reassigned to ${team} (persisted in DB)`, 'info');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reassign case';
      showToast(`Error assigning team: ${msg}`, 'warn');
    }
  };

  const selectedCase = cases.find((c) => c.id === selectedCaseId) || cases[0];

  return (
    <PaymoContext.Provider
      value={{
        cases,
        selectedCaseId,
        selectedCase,
        isLoading,
        error,
        toasts,
        showToast,
        removeToast,
        selectCase,
        fetchCases,
        createCase,
        updateCaseStatus,
        assignCaseTeam
      }}
    >
      {children}
    </PaymoContext.Provider>
  );
};

export const usePaymo = () => {
  const context = useContext(PaymoContext);
  if (!context) {
    throw new Error('usePaymo must be used within a PaymoProvider');
  }
  return context;
};
