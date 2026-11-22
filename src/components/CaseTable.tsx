import React from 'react';
import { Case } from '../types';
import { StatusLabel } from './StatusLabel';

interface CaseTableProps {
  cases: Case[];
  selectedCaseId?: string;
  onSelectCase: (id: string) => void;
  compact?: boolean;
}

export const CaseTable: React.FC<CaseTableProps> = ({
  cases,
  selectedCaseId,
  onSelectCase,
  compact = false,
}) => {
  if (cases.length === 0) {
    return (
      <div className="border border-white p-6 text-center text-xs font-mono text-neutral-400">
        NO CASES MATCH CURRENT FILTERS.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto border border-white bg-black">
      <table className="w-full border-collapse text-left text-xs font-mono">
        <thead>
          <tr className="border-b border-white bg-neutral-950 text-neutral-400">
            <th className="p-2.5 font-normal uppercase tracking-wider border-r border-neutral-800">Case ID</th>
            <th className="p-2.5 font-normal uppercase tracking-wider border-r border-neutral-800">Order ID</th>
            <th className="p-2.5 font-normal uppercase tracking-wider border-r border-neutral-800">Amount</th>
            <th className="p-2.5 font-normal uppercase tracking-wider border-r border-neutral-800">Customer</th>
            <th className="p-2.5 font-normal uppercase tracking-wider border-r border-neutral-800">Payment</th>
            <th className="p-2.5 font-normal uppercase tracking-wider border-r border-neutral-800">Investigation</th>
            {!compact && <th className="p-2.5 font-normal uppercase tracking-wider border-r border-neutral-800">Team</th>}
            {!compact && <th className="p-2.5 font-normal uppercase tracking-wider">Date</th>}
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const isSelected = c.id === selectedCaseId;
            const orderId = c.order_id || c.orderId || 'ORD_UNKNOWN';
            const customerName = c.customer_name || c.customerName || 'Anonymous';
            const paymentStatus = c.payment_status || c.paymentStatus || 'FAILED';
            const investigationStatus = c.investigation_status || c.investigationStatus || 'OPEN';
            const team = c.assigned_team || c.assignedTeam || 'Engineering';

            return (
              <tr
                key={c.id}
                onClick={() => onSelectCase(c.id)}
                className={`cursor-pointer transition-colors border-b border-neutral-900 ${
                  isSelected
                    ? 'bg-white text-black font-semibold'
                    : 'hover:bg-neutral-900 text-white'
                }`}
              >
                <td className={`p-2.5 border-r ${isSelected ? 'border-neutral-300' : 'border-neutral-900'}`}>
                  {c.id}
                </td>
                <td className={`p-2.5 border-r ${isSelected ? 'border-neutral-300' : 'border-neutral-900'}`}>
                  {orderId}
                </td>
                <td className={`p-2.5 border-r ${isSelected ? 'border-neutral-300' : 'border-neutral-900'}`}>
                  ₹{c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className={`p-2.5 border-r ${isSelected ? 'border-neutral-300' : 'border-neutral-900'} truncate max-w-[140px]`}>
                  {customerName}
                </td>
                <td className={`p-2.5 border-r ${isSelected ? 'border-neutral-300' : 'border-neutral-900'}`}>
                  <StatusLabel status={paymentStatus} type="payment" />
                </td>
                <td className={`p-2.5 border-r ${isSelected ? 'border-neutral-300' : 'border-neutral-900'}`}>
                  <StatusLabel status={investigationStatus} type="investigation" />
                </td>
                {!compact && (
                  <td className={`p-2.5 border-r ${isSelected ? 'border-neutral-300' : 'border-neutral-900'}`}>
                    {team}
                  </td>
                )}
                {!compact && (
                  <td className="p-2.5 text-neutral-400 whitespace-nowrap">
                    {c.date || 'Recent'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
