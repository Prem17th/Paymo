import { Case, ChaosScenario, McpTool } from '../types';

export const DEMO_CASES: Case[] = [
  {
    id: 'CASE-2024-8831',
    orderId: 'ORD_9823412',
    transactionId: 'cf_tx_90812938',
    customerName: 'Aarav Sharma',
    customerEmail: 'aarav.sharma@example.com',
    customerPhone: '+91 98765 43210',
    amount: 2499.00,
    currency: 'INR',
    paymentStatus: 'FAILED',
    orderStatus: 'PENDING_CONFIRMATION',
    investigationStatus: 'OPEN',
    assignedTeam: 'Engineering',
    channel: 'UPI',
    date: '2026-11-21 11:42 AM',
    lastUpdated: '12 mins ago',
    errorMessage: 'UPI VPA debit success, webhook delivery timeout exceeded (504 Gateway Timeout).',
    timeline: [
      {
        id: 'tl-1',
        time: '11:42:01 AM',
        title: 'Payment initiated via UPI',
        detail: 'User approved PSP prompt on PhonePe UPI.',
        actor: 'Customer'
      },
      {
        id: 'tl-2',
        time: '11:42:15 AM',
        title: 'UPI debit confirmed at NPCI',
        detail: 'NPCI reference #329188401948 - amount debited from HDFC Bank.',
        actor: 'Cashfree PG'
      },
      {
        id: 'tl-3',
        time: '11:43:00 AM',
        title: 'Webhook delivery failed',
        detail: 'Merchant endpoint https://api.store.com/webhooks/cashfree timed out after 30s.',
        actor: 'Cashfree Webhook Service'
      },
      {
        id: 'tl-4',
        time: '11:45:00 AM',
        title: 'Incident auto-created',
        detail: 'Discrepancy detected: Gateway status is SUCCESS, merchant Order status is PENDING.',
        actor: 'Paymo Sentinel'
      }
    ],
    webhooks: [
      {
        id: 'wh-8831-01',
        event: 'PAYMENT_SUCCESS_WEBHOOK',
        receivedAt: '2026-11-21 11:42:45',
        status: 'DROPPED',
        payload: {
          event_time: '2026-11-21T11:42:45+05:30',
          type: 'PAYMENT_SUCCESS_WEBHOOK',
          data: {
            order: { order_id: 'ORD_9823412', order_amount: 2499.00, order_currency: 'INR' },
            payment: { payment_id: 'cf_tx_90812938', payment_status: 'SUCCESS', payment_group: 'upi' }
          }
        }
      }
    ]
  },
  {
    id: 'CASE-2024-8830',
    orderId: 'ORD_9823290',
    transactionId: 'cf_tx_90812844',
    customerName: 'Priya Sundaram',
    customerEmail: 'priya.s@example.org',
    customerPhone: '+91 94440 12345',
    amount: 14500.00,
    currency: 'INR',
    paymentStatus: 'CHARGED',
    orderStatus: 'MANUAL_REVIEW',
    investigationStatus: 'INVESTIGATING',
    assignedTeam: 'Finance',
    channel: 'Cards',
    date: '2026-11-21 10:15 AM',
    lastUpdated: '1 hr ago',
    errorMessage: 'Customer reported debit; 3DS authorization delayed by issuing bank.',
    timeline: [
      {
        id: 'tl-10',
        time: '10:15:10 AM',
        title: 'Card 3DS Challenge',
        detail: 'OTP verification delayed by SBI cards gateway.',
        actor: 'Customer'
      },
      {
        id: 'tl-11',
        time: '10:18:22 AM',
        title: 'Late authorization packet received',
        detail: 'Authorization code: AUTH_994109 received after browser checkout session expired.',
        actor: 'Acquiring Bank'
      }
    ],
    webhooks: [
      {
        id: 'wh-8830-01',
        event: 'PAYMENT_DELAYED_CONFIRMATION',
        receivedAt: '2026-11-21 10:18:22',
        status: 'DELAYED',
        payload: {
          event_time: '2026-11-21T10:18:22+05:30',
          type: 'PAYMENT_DELAYED_CONFIRMATION',
          data: {
            order_id: 'ORD_9823290',
            auth_code: 'AUTH_994109',
            amount: 14500.00
          }
        }
      }
    ]
  },
  {
    id: 'CASE-2024-8829',
    orderId: 'ORD_9822981',
    transactionId: 'cf_tx_90811901',
    customerName: 'Kavita Reddy',
    customerEmail: 'kavita.r@techcorp.in',
    customerPhone: '+91 99887 66554',
    amount: 820.00,
    currency: 'INR',
    paymentStatus: 'REFUNDED',
    orderStatus: 'CANCELLED',
    investigationStatus: 'RESOLVED',
    assignedTeam: 'Support',
    channel: 'UPI',
    date: '2026-11-20 04:30 PM',
    lastUpdated: 'Yesterday',
    errorMessage: 'Duplicate payment on retry. Auto-refund initiated for second capture.',
    timeline: [
      {
        id: 'tl-20',
        time: '04:30:00 PM',
        title: 'Duplicate charge identified',
        detail: 'Two debits recorded against same merchant cart ID.',
        actor: 'Paymo Ledger'
      },
      {
        id: 'tl-21',
        time: '04:31:12 PM',
        title: 'Refund dispatched to source VPA',
        detail: 'Refund reference #RF_39201948 completed successfully.',
        actor: 'Finance'
      }
    ],
    webhooks: [
      {
        id: 'wh-8829-01',
        event: 'REFUND_PROCESSED',
        receivedAt: '2026-11-20 16:31:15',
        status: 'DELIVERED',
        payload: {
          event_time: '2026-11-20T16:31:15+05:30',
          type: 'REFUND_PROCESSED',
          refund_id: 'RF_39201948',
          amount: 820.00
        }
      }
    ]
  },
  {
    id: 'CASE-2024-8828',
    orderId: 'ORD_9821900',
    transactionId: 'cf_tx_90810112',
    customerName: 'Rahul Verma',
    customerEmail: 'rahul.verma@domain.co',
    customerPhone: '+91 97112 33445',
    amount: 5600.00,
    currency: 'INR',
    paymentStatus: 'FAILED',
    orderStatus: 'PENDING_CONFIRMATION',
    investigationStatus: 'ESCALATED',
    assignedTeam: 'Engineering',
    channel: 'Netbanking',
    date: '2026-11-20 02:10 PM',
    lastUpdated: 'Yesterday',
    errorMessage: 'Netbanking callback signature validation mismatch.',
    timeline: [
      {
        id: 'tl-30',
        time: '02:10:05 PM',
        title: 'Signature verification error',
        detail: 'HMAC-SHA256 signature calculated did not match Cashfree header signature.',
        actor: 'Security Firewall'
      }
    ],
    webhooks: [
      {
        id: 'wh-8828-01',
        event: 'PAYMENT_FAILED_INTEGRITY',
        receivedAt: '2026-11-20 14:10:05',
        status: 'SIGNATURE_FAILED',
        payload: {
          error: 'BAD_SIGNATURE',
          order_id: 'ORD_9821900'
        }
      }
    ]
  },
  {
    id: 'CASE-2024-8827',
    orderId: 'ORD_9821744',
    transactionId: 'cf_tx_90809823',
    customerName: 'Meera Iyer',
    customerEmail: 'meera.iyer@webmail.in',
    customerPhone: '+91 98200 98200',
    amount: 1199.00,
    currency: 'INR',
    paymentStatus: 'SUCCESS',
    orderStatus: 'COMPLETED',
    investigationStatus: 'RESOLVED',
    assignedTeam: 'Support',
    channel: 'UPI',
    date: '2026-11-20 01:00 PM',
    lastUpdated: 'Yesterday',
    errorMessage: 'Delayed webhook cleared after secondary poller execution.',
    timeline: [
      {
        id: 'tl-40',
        time: '01:00:10 PM',
        title: 'Reconciled via order polling',
        detail: 'Cashfree GET /orders/ORD_9821744 returned PAID.',
        actor: 'Paymo Cron'
      }
    ],
    webhooks: []
  }
];

export const DEMO_OVERVIEW_STATS = {
  totalCases: 142,
  openCases: 18,
  resolvedCases: 119,
  pendingInvestigations: 5
};

export const CHAOS_SCENARIOS: ChaosScenario[] = [
  {
    id: 'duplicate_webhook',
    name: 'Duplicate Webhook Delivery',
    description: 'Simulates the gateway dispatching the identical PAYMENT_SUCCESS webhook twice with a 2-second interval.',
    simulatedFailure: 'Double crediting / duplicate fulfillment attempt'
  },
  {
    id: 'delayed_webhook',
    name: 'Delayed Webhook (120s lag)',
    description: 'Simulates network congestion where webhook arrives 2 minutes after user leaves checkout screen.',
    simulatedFailure: 'User sees failure while bank account was debited'
  },
  {
    id: 'missing_webhook',
    name: 'Dropped Webhook (Permanent 5xx)',
    description: 'Simulates complete failure of webhook delivery channel; tests polling fallback recovery.',
    simulatedFailure: 'Order stranded in PENDING indefinitely'
  },
  {
    id: 'signature_mismatch',
    name: 'Compromised Signature / Tampered Payload',
    description: 'Simulates altered payload hash to verify that cryptographic signature check halts processing.',
    simulatedFailure: 'Security violation and rejection of spoofed capture'
  }
];

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'investigate_order',
    description: 'Correlates Cashfree payment gateway ledger with merchant database order state.',
    parameters: '{"order_id": "string", "include_webhooks": "boolean"}',
    status: 'Ready (Frontend spec)'
  },
  {
    name: 'simulate_chaos',
    description: 'Injects synthetic failure scenarios into the Paymo test harness for resilience auditing.',
    parameters: '{"scenario": "string", "order_id": "string"}',
    status: 'Ready (Frontend spec)'
  },
  {
    name: 'reconcile_incident',
    description: 'Executes automated state reconciliation or marks case for human finance intervention.',
    parameters: '{"case_id": "string", "action": "FORCE_SYNC | REFUND | DISMISS"}',
    status: 'Ready (Frontend spec)'
  },
  {
    name: 'query_sarvam_nlu',
    description: 'Parses conversational user query in 10 Indian languages to extract transaction IDs and emotion state.',
    parameters: '{"user_query": "string", "source_language": "string"}',
    status: 'Ready (Frontend spec)'
  }
];

export const INITIAL_ASSISTANT_MESSAGES = [
  {
    id: 'msg-1',
    sender: 'assistant' as const,
    content: 'Hello! I am Paymo Assist, your multilingual payment verification companion. If you were debited but your order failed, enter your transaction ID or upload a screenshot of your payment receipt below.',
    timestamp: '11:42 AM',
    audioAvailable: true
  },
  {
    id: 'msg-2',
    sender: 'user' as const,
    content: 'My account was debited ₹2,499 via UPI for order ORD_9823412, but the app says payment failed. Please check!',
    timestamp: '11:43 AM'
  },
  {
    id: 'msg-3',
    sender: 'assistant' as const,
    content: '[DEMO RESPONSE] I have correlated your order ORD_9823412 with Cashfree payment cf_tx_90812938. The funds were successfully debited from your bank account, but the store server timed out receiving the webhook confirmation. A recovery case (CASE-2024-8831) has been created and assigned to Engineering for reconciliation.',
    timestamp: '11:43 AM',
    audioAvailable: true,
    metadata: {
      orderId: 'ORD_9823412',
      transactionId: 'cf_tx_90812938',
      amount: 2499.00,
      status: 'GATEWAY_SUCCESS_MERCHANT_TIMEOUT'
    }
  }
];
