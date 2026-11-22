import {
  Case,
  WebhookLog
} from '../types';

const API_BASE_URL = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || 'http://127.0.0.1:8000/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export const api = {
  // Health
  getHealth: () => request<{ status: string; environment: string; database: string }>('/health'),

  // Overview Summary
  getOverviewSummary: () => request<{
    total_cases: number;
    open_cases: number;
    resolved_cases: number;
    pending_investigations: number;
    recent_cases: Case[];
    total_payments?: number;
    successful_payments?: number;
    pending_payments?: number;
    failed_payments?: number;
    total_verified_amount?: number;
    today_payments_amount?: number;
    today_payments_count?: number;
    recent_transactions?: Array<{
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
    }>;
  }>('/overview/summary'),

  // Cases
  getCases: (params?: { search?: string; status?: string; team?: string; skip?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status && params.status !== 'ALL') query.append('status', params.status);
    if (params?.team && params.team !== 'ALL') query.append('team', params.team);
    if (params?.skip) query.append('skip', params.skip.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    const qs = query.toString();
    return request<Case[]>(`/cases${qs ? `?${qs}` : ''}`);
  },

  getCase: (caseId: string) => request<Case>(`/cases/${encodeURIComponent(caseId)}`),

  createCase: (payload: {
    order_id: string;
    transaction_id: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    amount: number;
    currency?: string;
    payment_status?: string;
    order_status?: string;
    assigned_team?: string;
    channel?: string;
    issue_type?: string;
    description?: string;
  }) => request<Case>('/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  updateCaseStatus: (caseId: string, status: string, reason?: string, actor?: string) =>
    request<Case>(`/cases/${encodeURIComponent(caseId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason, actor: actor || 'Lead Engineer' }),
    }),

  assignCase: (caseId: string, assigned_team: string, actor?: string) =>
    request<Case>(`/cases/${encodeURIComponent(caseId)}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_team, actor: actor || 'Lead Engineer' }),
    }),

  getCaseTimeline: (caseId: string) =>
    request<Array<{ event_id: string; case_id: string; event_type: string; description: string; actor: string; timestamp: string }>>(
      `/cases/${encodeURIComponent(caseId)}/timeline`
    ),

  // Assistant & Conversations
  getConversationMessages: (conversationId: string) =>
    request<Array<{
      message_id: string;
      conversation_id: string;
      case_id?: string;
      sender_type: 'user' | 'assistant' | 'system';
      message_content: string;
      language: string;
      audio_available: boolean;
      metadata_json?: string;
      created_at: string;
    }>>(`/conversations/${encodeURIComponent(conversationId)}/messages`),

  sendMessage: (conversationId: string, payload: {
    sender_type: 'user' | 'assistant' | 'system';
    message_content: string;
    language?: string;
    case_id?: string;
    metadata_json?: string;
  }) => request<{
    message_id: string;
    conversation_id: string;
    case_id?: string;
    sender_type: 'user' | 'assistant' | 'system';
    message_content: string;
    language: string;
    audio_available: boolean;
    metadata_json?: string;
    created_at: string;
  }>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  // Phase 3A: GPT-Powered Agent Turn & Audit
  getAgentAuditStatus: () =>
    request<{
      configured: boolean;
      reachable: boolean;
      model: string;
      status: string;
      message: string;
    }>('/agent/audit-status'),

  sendAgentChat: (conversationId: string, message: string, language?: string) =>
    request<{
      message_id: string;
      conversation_id: string;
      content: string;
      execution_engine: string;
      is_fallback: boolean;
      fallback_reason?: string;
      tools_executed: Array<{ tool: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
      pending_action?: {
        action_id: string;
        conversation_id: string;
        action_type: string;
        summary: string;
        status: string;
        payload: Record<string, unknown>;
        created_at: string;
        expires_at: string;
      };
      report_text?: string;
      report_filename?: string;
      created_at: string;
    }>(`/conversations/${encodeURIComponent(conversationId)}/agent-chat`, {
      method: 'POST',
      body: JSON.stringify({ message, language }),
    }),

  // Phase 3B: Server-Validated Action Confirmations
  confirmAction: (conversationId: string, actionId: string) =>
    request<{
      success: boolean;
      action_id: string;
      status: string;
      message: string;
      case?: Case;
    }>(`/conversations/${encodeURIComponent(conversationId)}/actions/${encodeURIComponent(actionId)}/confirm`, {
      method: 'POST',
    }),

  cancelAction: (conversationId: string, actionId: string) =>
    request<{
      success: boolean;
      action_id: string;
      status: string;
      message: string;
    }>(`/conversations/${encodeURIComponent(conversationId)}/actions/${encodeURIComponent(actionId)}/cancel`, {
      method: 'POST',
    }),

  // Phase 3B: Sarvam AI Voice Integration
  getVoiceStatus: () =>
    request<{
      configured: boolean;
      reachable: boolean;
      stt_model: string;
      tts_model: string;
      status: string;
      message: string;
    }>('/voice/status'),

  transcribeAudio: async (audioBlob: Blob, languageCode?: string) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.wav');
    if (languageCode) {
      formData.append('language_code', languageCode);
    }

    const url = `${API_BASE_URL}/voice/transcribe`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errJson = await response.json();
        if (errJson.detail) {
          errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        // ignore
      }
      throw new Error(errorDetail);
    }

    return response.json() as Promise<{
      success: boolean;
      transcript: string;
      language_code: string;
      model: string;
      provider: string;
    }>;
  },

  synthesizeSpeech: (text: string, languageCode?: string, speaker?: string) =>
    request<{
      success: boolean;
      audio_base64: string;
      audio_format: string;
      language_code: string;
      speaker: string;
      model: string;
      provider: string;
    }>('/voice/synthesize', {
      method: 'POST',
      body: JSON.stringify({
        text,
        language_code: languageCode || 'en-IN',
        speaker,
      }),
    }),


  // Cashfree Payment Gateway
  getCashfreeStatus: () =>
    request<{
      configured: boolean;
      reachable: boolean;
      environment: string;
      status: string;
      message: string;
    }>('/cashfree/status'),

  createPaymentOrder: (payload: {
    amount: number;
    description?: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
  }) =>
    request<{
      success: boolean;
      order_id: string;
      amount: number;
      currency: string;
      payment_session_id?: string;
      cf_order_id?: string;
      order_status: string;
      is_simulated: boolean;
    }>('/payments/create-order', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyPayment: (orderId: string) =>
    request<{
      order_id: string;
      transaction_id: string;
      amount: number;
      currency: string;
      payment_status: string;
      order_status: string;
      source: string;
      payment_method: string;
      customer_name?: string;
      customer_email?: string;
      created_at: string;
      verified_by: string;
    }>(`/payments/verify/${encodeURIComponent(orderId)}`),

  getPayments: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return request<Array<{
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
    }>>(`/payments${qs}`);
  },

  // Receipt Upload & Vision Extraction
  extractReceipt: async (file: File, language?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (language) formData.append('language', language);
    const response = await fetch(`${API_BASE_URL}/receipts/extract`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      let err = `HTTP ${response.status}`;
      try {
        const j = await response.json();
        if (j.detail) err = j.detail;
      } catch {}
      throw new Error(err);
    }
    return response.json() as Promise<{
      amount: number | null;
      currency: string;
      date: string | null;
      transaction_reference: string | null;
      merchant_name: string | null;
      payment_method: string | null;
      payment_status: string | null;
      summary: string;
      is_verified: boolean;
      verification_label: string;
      matched_transaction?: {
        transaction_id: string;
        order_id: string;
        amount: number;
        currency: string;
        payment_status: string;
        order_status: string;
        source: string;
        payment_method: string;
        created_at: string;
      } | null;
    }>;
  },

  // Contact Directory
  getContacts: () =>
    request<Array<{ id: number; name: string; phone: string; created_at?: string }>>('/contacts'),

  importContacts: (contacts: Array<{ name: string; phone: string }>) =>
    request<Array<{ id: number; name: string; phone: string; created_at?: string }>>('/contacts/bulk', {
      method: 'POST',
      body: JSON.stringify({ contacts }),
    }),

  clearContacts: () =>
    request<{ success: boolean; deleted: number }>('/contacts', {
      method: 'DELETE',
    }),

  // Developer & Transactions
  lookupTransaction: (lookupId: string) =>
    request<{
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
    }>(`/transactions/${encodeURIComponent(lookupId)}`),

  getWebhooks: () => request<WebhookLog[]>('/webhooks'),

  getTransactionWebhooks: (transactionId: string) =>
    request<WebhookLog[]>(`/webhooks/by-transaction/${encodeURIComponent(transactionId)}`),

  // Chaos Lab
  getChaosHistory: () => request<Array<{
    test_id: string;
    case_id?: string;
    scenario: string;
    status: string;
    results: string;
    created_at: string;
  }>>('/chaos/history'),

  runChaosTest: (payload: { scenario_id: string; case_id?: string; order_id?: string }) =>
    request<{
      test_id: string;
      case_id?: string;
      scenario: string;
      status: string;
      results: string;
      created_at: string;
    }>('/chaos/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
