from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from backend.app.db.session import get_db
from backend.app.schemas.pydantic_schemas import (
    HealthResponse,
    OverviewSummaryResponse,
    CaseResponse,
    CaseCreateRequest,
    CaseStatusUpdateRequest,
    CaseAssignRequest,
    IncidentEventCreateRequest,
    IncidentEventResponse,
    MessageResponse,
    MessageCreateRequest,
    ConversationResponse,
    TransactionResponse,
    WebhookEventResponse,
    ChaosRunRequest,
    ChaosRunResponse,
    AgentChatRequest,
    AgentChatResponse,
    AgentAuditStatusResponse,
    PendingActionDetail,
    ActionConfirmResponse,
    ActionCancelResponse,
    VoiceTranscriptionResponse,
    VoiceSynthesisRequest,
    VoiceSynthesisResponse,
    VoiceStatusResponse,
    PaymentCreateRequest,
    PaymentCreateResponse,
    PaymentVerifyResponse,
    CashfreeStatusResponse,
    ReceiptExtractResponse,
    ContactItem,
    ContactBulkCreateRequest,
    ContactClearResponse,
)
from backend.app.services import (
    case_service,
    chat_service,
    transaction_service,
    agent_service,
    sarvam_service,
    cashfree_service,
    receipt_service,
    contact_service
)
from backend.app.services.action_service import action_store
from backend.app.core.config import settings

router = APIRouter()

# ----------------- 1. HEALTH -----------------
@router.get("/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(
        status="ok",
        environment=settings.PAYMO_ENV,
        database="sqlite",
        timestamp=datetime.now(timezone.utc)
    )

# ----------------- 2. OVERVIEW SUMMARY -----------------
@router.get("/overview/summary", response_model=OverviewSummaryResponse)
def get_overview_summary(db: Session = Depends(get_db)):
    return case_service.get_overview_summary(db)

# ----------------- 3. CASES -----------------
@router.get("/cases", response_model=List[CaseResponse])
def list_cases(
    search: Optional[str] = Query(None, description="Search term for case, customer or order"),
    status: Optional[str] = Query(None, description="Filter by status: OPEN, INVESTIGATING, RESOLVED, ESCALATED"),
    team: Optional[str] = Query(None, description="Filter by team: Engineering, Support, Finance"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    return case_service.list_cases(db, search=search, status=status, team=team, skip=skip, limit=limit)

@router.post("/cases", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(case_in: CaseCreateRequest, db: Session = Depends(get_db)):
    return case_service.create_case(db, case_in)

@router.get("/cases/{case_id}", response_model=CaseResponse)
def get_case_details(case_id: str, db: Session = Depends(get_db)):
    case = case_service.get_case_by_id(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case with ID '{case_id}' not found")
    return case

@router.patch("/cases/{case_id}/status", response_model=CaseResponse)
def update_case_status(
    case_id: str,
    status_in: CaseStatusUpdateRequest,
    db: Session = Depends(get_db)
):
    updated = case_service.update_case_status(
        db,
        case_id=case_id,
        status=status_in.status,
        reason=status_in.reason,
        actor=status_in.actor or "Lead Engineer"
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Case with ID '{case_id}' not found")
    return updated

@router.patch("/cases/{case_id}/assign", response_model=CaseResponse)
def assign_case(
    case_id: str,
    assign_in: CaseAssignRequest,
    db: Session = Depends(get_db)
):
    updated = case_service.assign_case_team(
        db,
        case_id=case_id,
        team=assign_in.assigned_team,
        actor=assign_in.actor or "Lead Engineer"
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Case with ID '{case_id}' not found")
    return updated

@router.get("/cases/{case_id}/timeline", response_model=List[IncidentEventResponse])
def get_case_timeline(case_id: str, db: Session = Depends(get_db)):
    case = case_service.get_case_by_id(db, case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case with ID '{case_id}' not found")
    return case.timeline

@router.post("/cases/{case_id}/timeline", response_model=IncidentEventResponse, status_code=status.HTTP_201_CREATED)
def add_case_event(
    case_id: str,
    event_in: IncidentEventCreateRequest,
    db: Session = Depends(get_db)
):
    event = case_service.add_incident_event(
        db,
        case_id=case_id,
        event_type=event_in.event_type,
        description=event_in.description,
        actor=event_in.actor
    )
    if not event:
        raise HTTPException(status_code=404, detail=f"Case with ID '{case_id}' not found")
    return event

# ----------------- 4. ASSISTANT & CONVERSATIONS -----------------
@router.get("/agent/audit-status", response_model=AgentAuditStatusResponse)
def get_agent_audit_status():
    return agent_service.check_openai_availability()

@router.post("/conversations/{conversation_id}/agent-chat", response_model=AgentChatResponse)
def agent_chat(
    conversation_id: str,
    chat_in: AgentChatRequest,
    db: Session = Depends(get_db)
):
    return agent_service.run_agent_turn(
        conversation_id=conversation_id,
        user_message=chat_in.message,
        language=chat_in.language or "en",
        db=db
    )

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
def get_conversation_messages(conversation_id: str, db: Session = Depends(get_db)):
    return chat_service.get_conversation_messages(db, conversation_id)

@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def send_message(
    conversation_id: str,
    msg_in: MessageCreateRequest,
    db: Session = Depends(get_db)
):
    return chat_service.add_message(
        db,
        conversation_id=conversation_id,
        sender_type=msg_in.sender_type,
        message_content=msg_in.message_content,
        language=msg_in.language or "en",
        case_id=msg_in.case_id,
        metadata_json=msg_in.metadata_json,
        audio_available=(msg_in.sender_type == "assistant")
    )

# ----------------- 5. TRANSACTIONS & WEBHOOKS -----------------
@router.get("/transactions/{lookup_id}", response_model=TransactionResponse)
def lookup_transaction(lookup_id: str, db: Session = Depends(get_db)):
    txn = transaction_service.lookup_transaction(db, lookup_id)
    if not txn:
        raise HTTPException(status_code=404, detail=f"Transaction or Order '{lookup_id}' not found in database")
    return txn

@router.get("/webhooks", response_model=List[WebhookEventResponse])
def list_all_webhooks(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return transaction_service.list_all_webhooks(db, limit=limit)

@router.get("/webhooks/by-transaction/{transaction_id}", response_model=List[WebhookEventResponse])
def get_transaction_webhooks(transaction_id: str, db: Session = Depends(get_db)):
    return transaction_service.get_webhooks_for_transaction(db, transaction_id)

# ----------------- 6. PAYMENT CHAOS LAB -----------------
@router.get("/chaos/history", response_model=List[ChaosRunResponse])
def get_chaos_history(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    return transaction_service.list_chaos_history(db, limit=limit)

@router.post("/chaos/run", response_model=ChaosRunResponse, status_code=status.HTTP_201_CREATED)
def run_chaos_test(
    chaos_in: ChaosRunRequest,
    db: Session = Depends(get_db)
):
    return transaction_service.record_chaos_run(
        db,
        scenario_id=chaos_in.scenario_id,
        case_id=chaos_in.case_id,
        order_id=chaos_in.order_id
    )

# ----------------- 7. SERVER-VALIDATED PENDING ACTIONS -----------------
@router.post("/conversations/{conversation_id}/actions/{action_id}/confirm", response_model=ActionConfirmResponse)
def confirm_pending_action(
    conversation_id: str,
    action_id: str,
    db: Session = Depends(get_db)
):
    """
    Explicit server-validated authorization workflow for state-changing operations.
    Direct chat messages cannot authorize mutations.
    """
    res = action_store.confirm_action(db, conversation_id, action_id)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Action confirmation failed"))
    return res

@router.post("/conversations/{conversation_id}/actions/{action_id}/cancel", response_model=ActionCancelResponse)
def cancel_pending_action(
    conversation_id: str,
    action_id: str
):
    """
    Cancels a staged action token before execution.
    """
    res = action_store.cancel_action(conversation_id, action_id)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Action cancellation failed"))
    return res

# ----------------- 8. SARVAM AI VOICE INTEGRATION -----------------
@router.get("/voice/status", response_model=VoiceStatusResponse)
def get_voice_status():
    """
    Safely inspects whether Sarvam AI is configured and reachable without exposing the key.
    """
    return sarvam_service.check_sarvam_availability()

@router.post("/voice/transcribe", response_model=VoiceTranscriptionResponse)
async def transcribe_audio_file(
    file: UploadFile = File(...),
    language_code: Optional[str] = Form(None)
):
    """
    Transcribes audio recording using Sarvam AI STT (Saaras v2).
    Supports Kannada (kn-IN), Hindi (hi-IN), English (en-IN).
    """
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file uploaded.")
    
    return sarvam_service.transcribe_audio(
        file_bytes=file_bytes,
        filename=file.filename or "recording.wav",
        content_type=file.content_type or "audio/wav",
        language_code=language_code
    )

@router.post("/voice/synthesize", response_model=VoiceSynthesisResponse)
def synthesize_speech_text(
    synthesis_in: VoiceSynthesisRequest
):
    """
    Synthesizes speech audio WAV using Sarvam AI TTS (Bulbul v1).
    """
    return sarvam_service.synthesize_speech(
        text=synthesis_in.text,
        language_code=synthesis_in.language_code or "en-IN",
        speaker=synthesis_in.speaker
    )

# ----------------- 9. CASHFREE PAYMENT GATEWAY -----------------
@router.get("/cashfree/status", response_model=CashfreeStatusResponse)
def get_cashfree_status():
    """
    Safely inspects whether Cashfree Sandbox credentials are configured and reachable.
    """
    return cashfree_service.check_cashfree_availability()

@router.post("/payments/create-order", response_model=PaymentCreateResponse)
def create_payment_order(order_in: PaymentCreateRequest, db: Session = Depends(get_db)):
    """
    Creates a Cashfree Sandbox payment order and registers transaction in SQLite.
    """
    return cashfree_service.create_sandbox_order(
        db,
        amount=order_in.amount,
        description=order_in.description,
        customer_name=order_in.customer_name,
        customer_email=order_in.customer_email,
        customer_phone=order_in.customer_phone
    )

@router.get("/payments/verify/{order_id}", response_model=PaymentVerifyResponse)
def verify_payment_order(order_id: str, db: Session = Depends(get_db)):
    """
    Server-side verification of payment status via Cashfree's authenticated API.
    """
    return cashfree_service.verify_order_payment(db, order_id)

@router.get("/payments", response_model=List[TransactionResponse])
def list_payments(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)):
    """
    Lists real transaction history from SQLite.
    """
    return [
        TransactionResponse(**p) for p in cashfree_service.list_recent_payments(db, limit=limit)
    ]

@router.post("/receipts/extract", response_model=ReceiptExtractResponse)
async def extract_receipt_endpoint(
    file: UploadFile = File(...),
    language: Optional[str] = Form("en-IN"),
    db: Session = Depends(get_db)
):
    """
    Extracts payment information from uploaded receipt (PNG, JPG, PDF) using OpenAI Vision / document processing.
    Correlates extracted data with SQLite database to verify if an authorized Cashfree record exists.
    """
    contents = await file.read()
    return receipt_service.extract_receipt_data(
        contents,
        filename=file.filename or "receipt.jpg",
        content_type=file.content_type or "image/jpeg",
        db=db,
        language=language or "en-IN"
    )


# ----------------- 12. CONTACT DIRECTORY -----------------
@router.get("/contacts", response_model=List[ContactItem])
def get_contacts(db: Session = Depends(get_db)):
    """Lists persistent contacts from SQLite."""
    return contact_service.list_contacts(db)


@router.post("/contacts/bulk", response_model=List[ContactItem])
def import_contacts_bulk(req: ContactBulkCreateRequest, db: Session = Depends(get_db)):
    """Bulk imports contacts from CSV into SQLite."""
    return contact_service.bulk_create_contacts(db, req.contacts)


@router.delete("/contacts", response_model=ContactClearResponse)
def clear_contacts(db: Session = Depends(get_db)):
    """Permanently deletes all contacts from SQLite without recreating demo records."""
    count = contact_service.clear_all_contacts(db)
    return ContactClearResponse(success=True, deleted=count)



