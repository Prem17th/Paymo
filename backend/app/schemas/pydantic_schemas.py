from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr, ConfigDict

class HealthResponse(BaseModel):
    status: str = "ok"
    environment: str
    database: str
    timestamp: datetime


class IncidentEventCreateRequest(BaseModel):
    event_type: str
    description: str
    actor: str = "Lead Engineer"


class IncidentEventResponse(BaseModel):
    event_id: str
    case_id: str
    event_type: str
    description: str
    actor: str
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)


class WebhookEventResponse(BaseModel):
    event_id: str
    transaction_id: Optional[str] = None
    provider: str = "CASHFREE"
    event_type: str
    payload: Dict[str, Any]
    received_timestamp: datetime
    processing_status: str
    model_config = ConfigDict(from_attributes=True)


class CaseCreateRequest(BaseModel):
    order_id: str = Field(..., min_length=2)
    transaction_id: str = Field(..., min_length=2)
    customer_name: str = Field(..., min_length=1)
    customer_email: EmailStr
    customer_phone: Optional[str] = None
    amount: float = Field(..., ge=0.0)
    currency: Optional[str] = "INR"
    payment_status: str = "FAILED"
    order_status: Optional[str] = "PENDING_CONFIRMATION"
    assigned_team: Optional[str] = "Engineering"
    channel: Optional[str] = "UPI"
    issue_type: Optional[str] = "DISCREPANCY"
    description: Optional[str] = None


class CaseStatusUpdateRequest(BaseModel):
    status: str = Field(..., pattern="^(OPEN|INVESTIGATING|RESOLVED|ESCALATED)$")
    reason: Optional[str] = None
    actor: Optional[str] = "Lead Engineer"


class CaseAssignRequest(BaseModel):
    assigned_team: str = Field(..., pattern="^(Engineering|Support|Finance)$")
    actor: Optional[str] = "Lead Engineer"


class CaseResponse(BaseModel):
    id: str
    order_id: str
    transaction_id: str
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = None
    amount: float
    currency: str
    payment_status: str
    order_status: str
    investigation_status: str
    assigned_team: str
    channel: str
    issue_type: str
    description: Optional[str] = None
    date: str
    last_updated: str
    timeline: List[IncidentEventResponse] = []
    webhooks: List[WebhookEventResponse] = []
    model_config = ConfigDict(from_attributes=True)


class OverviewSummaryResponse(BaseModel):
    total_cases: int = 0
    open_cases: int = 0
    resolved_cases: int = 0
    pending_investigations: int = 0
    recent_cases: List[CaseResponse] = []
    total_payments: int = 0
    successful_payments: int = 0
    pending_payments: int = 0
    failed_payments: int = 0
    total_verified_amount: float = 0.0
    today_payments_amount: float = 0.0
    today_payments_count: int = 0
    recent_transactions: List[TransactionResponse] = []


class ReceiptExtractResponse(BaseModel):
    amount: Optional[float] = None
    currency: Optional[str] = "INR"
    date: Optional[str] = None
    transaction_reference: Optional[str] = None
    merchant_name: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    summary: str
    is_verified: bool = False
    verification_label: str = "Unverified receipt"
    matched_transaction: Optional[Dict[str, Any]] = None


class ContactItem(BaseModel):
    id: Optional[int] = None
    name: str
    phone: str
    created_at: Optional[str] = None


class ContactBulkCreateRequest(BaseModel):
    contacts: List[ContactItem]


class ContactClearResponse(BaseModel):
    success: bool
    deleted: int



class MessageCreateRequest(BaseModel):
    sender_type: str = Field(..., pattern="^(user|assistant|system)$")
    message_content: str = Field(..., min_length=1)
    language: Optional[str] = "en"
    case_id: Optional[str] = None
    metadata_json: Optional[str] = None


class MessageResponse(BaseModel):
    message_id: str
    conversation_id: str
    case_id: Optional[str] = None
    sender_type: str
    message_content: str
    language: str
    audio_available: bool = False
    metadata_json: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    conversation_id: str
    created_at: datetime
    messages: List[MessageResponse]


class TransactionResponse(BaseModel):
    transaction_id: str
    order_id: str
    amount: float
    currency: str
    payment_status: str
    order_status: str
    source: str
    payment_method: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ChaosRunRequest(BaseModel):
    scenario_id: str
    case_id: Optional[str] = None
    order_id: Optional[str] = None


class ChaosRunResponse(BaseModel):
    test_id: str
    case_id: Optional[str] = None
    scenario: str
    status: str
    results: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AgentChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    language: Optional[str] = "en"


class PendingActionDetail(BaseModel):
    action_id: str
    conversation_id: str
    action_type: str
    summary: str
    status: str
    payload: Dict[str, Any]
    created_at: str
    expires_at: str


class ActionConfirmResponse(BaseModel):
    success: bool
    action_id: str
    status: str
    message: str
    case: Optional[CaseResponse] = None


class ActionCancelResponse(BaseModel):
    success: bool
    action_id: str
    status: str
    message: str


class AgentChatResponse(BaseModel):
    message_id: str
    conversation_id: str
    content: str
    execution_engine: str = "LOCAL_FALLBACK"
    is_fallback: bool = True
    fallback_reason: Optional[str] = None
    tools_executed: List[Dict[str, Any]] = []
    pending_action: Optional[PendingActionDetail] = None
    report_text: Optional[str] = None
    report_filename: Optional[str] = None
    created_at: str


class AgentAuditStatusResponse(BaseModel):
    configured: bool
    reachable: bool
    model: str
    status: str
    message: str


class VoiceTranscriptionResponse(BaseModel):
    success: bool = True
    transcript: str
    language_code: str
    model: str
    provider: str


class VoiceSynthesisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)
    language_code: Optional[str] = "en-IN"
    speaker: Optional[str] = None


class VoiceSynthesisResponse(BaseModel):
    success: bool = True
    audio_base64: str
    audio_format: str = "audio/wav"
    language_code: str
    speaker: str
    model: str
    provider: str


class VoiceStatusResponse(BaseModel):
    configured: bool
    reachable: bool
    stt_model: str
    tts_model: str
    status: str
    message: str


class PaymentCreateRequest(BaseModel):
    amount: float = Field(..., gt=0, le=100000)
    description: Optional[str] = None
    customer_name: Optional[str] = "Demo Customer"
    customer_email: Optional[str] = "customer@example.com"
    customer_phone: Optional[str] = "9999999999"


class PaymentCreateResponse(BaseModel):
    success: bool
    order_id: str
    amount: float
    currency: str = "INR"
    payment_session_id: Optional[str] = None
    cf_order_id: Optional[str] = None
    order_status: str
    is_simulated: bool = False


class PaymentVerifyResponse(BaseModel):
    order_id: str
    transaction_id: str
    amount: float
    currency: str
    payment_status: str
    order_status: str
    source: str
    payment_method: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    created_at: str
    verified_by: str


class CashfreeStatusResponse(BaseModel):
    configured: bool
    reachable: bool
    environment: str
    status: str
    message: str



