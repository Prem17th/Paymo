export type PaymentStatus = 'FAILED' | 'CHARGED' | 'SUCCESS' | 'PENDING' | 'REFUNDED';
export type OrderStatus = 'PENDING_CONFIRMATION' | 'COMPLETED' | 'CANCELLED' | 'MANUAL_REVIEW';
export type InvestigationStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED';
export type AssignedTeam = 'Engineering' | 'Support' | 'Finance';

export interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  detail: string;
  actor: string;
}

export interface WebhookLog {
  id?: string;
  event_id?: string;
  transaction_id?: string;
  provider?: string;
  event?: string;
  event_type?: string;
  receivedAt?: string;
  received_timestamp?: string;
  status?: string;
  processing_status?: string;
  payload: Record<string, unknown>;
}

export interface Case {
  id: string;
  order_id?: string;
  orderId?: string;
  transaction_id?: string;
  transactionId?: string;
  customer_name?: string;
  customerName?: string;
  customer_email?: string;
  customerEmail?: string;
  customer_phone?: string;
  customerPhone?: string;
  amount: number;
  currency: string;
  payment_status?: string;
  paymentStatus?: PaymentStatus;
  order_status?: string;
  orderStatus?: OrderStatus;
  investigation_status?: string;
  investigationStatus?: InvestigationStatus;
  assigned_team?: string;
  assignedTeam?: AssignedTeam;
  channel?: 'UPI' | 'Cards' | 'Netbanking' | 'Wallet' | string;
  issue_type?: string;
  description?: string;
  date?: string;
  last_updated?: string;
  lastUpdated?: string;
  errorMessage?: string;
  timeline?: Array<{
    id?: string;
    event_id?: string;
    time?: string;
    title?: string;
    event_type?: string;
    detail?: string;
    description?: string;
    actor: string;
    timestamp?: string;
  }>;
  webhooks?: WebhookLog[];
}

export interface OverviewStats {
  totalCases: number;
  openCases: number;
  resolvedCases: number;
  pendingInvestigations: number;
}

export interface Message {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  audioAvailable?: boolean;
  executionEngine?: string;
  isFallback?: boolean;
  fallbackReason?: string;
  toolsExecuted?: Array<{ tool: string; args?: Record<string, unknown>; result?: Record<string, unknown> }>;
  reportText?: string;
  reportFilename?: string;
  pendingAction?: {
    action_id: string;
    conversation_id: string;
    action_type: string;
    summary: string;
    status: string;
    payload: Record<string, unknown>;
    created_at: string;
    expires_at: string;
  };
  metadata?: {
    orderId?: string;
    transactionId?: string;
    amount?: number;
    status?: string;
    report_file?: string;
    report_text?: string;
  };
}

export interface TransactionDetails {
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

export interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  simulatedFailure: string;
}

export interface ChaosTestResult {
  id: string;
  test_id?: string;
  scenarioId?: string;
  scenarioName?: string;
  scenario?: string;
  timestamp?: string;
  created_at?: string;
  status: string;
  details?: string;
  results?: string;
}

export interface McpTool {
  name: string;
  description: string;
  parameters: string;
  status: 'Ready (Frontend spec)' | 'Backend offline';
}
