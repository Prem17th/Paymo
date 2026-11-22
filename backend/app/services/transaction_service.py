import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from backend.app.models.entities import Transaction, WebhookEvent, ChaosTestRun
from backend.app.schemas.pydantic_schemas import (
    TransactionResponse,
    WebhookEventResponse,
    ChaosRunResponse
)

def lookup_transaction(db: Session, query: str) -> Optional[TransactionResponse]:
    q = query.strip()
    txn = (
        db.query(Transaction)
        .filter(or_(Transaction.transaction_id == q, Transaction.order_id == q))
        .first()
    )
    if not txn:
        return None

    return TransactionResponse(
        transaction_id=txn.transaction_id,
        order_id=txn.order_id,
        amount=round(txn.amount_paise / 100.0, 2),
        currency=txn.currency,
        payment_status=txn.payment_status,
        order_status=txn.order_status,
        source=txn.source,
        payment_method=txn.payment_method,
        customer_name=txn.customer_name,
        customer_email=txn.customer_email,
        created_at=txn.created_at
    )

def get_webhooks_for_transaction(db: Session, transaction_id: str) -> List[WebhookEventResponse]:
    events = (
        db.query(WebhookEvent)
        .filter(WebhookEvent.transaction_id == transaction_id)
        .order_by(desc(WebhookEvent.received_timestamp))
        .all()
    )
    results = []
    for wh in events:
        try:
            payload_dict = json.loads(wh.payload) if isinstance(wh.payload, str) else wh.payload
        except Exception:
            payload_dict = {"raw": wh.payload}
        results.append(
            WebhookEventResponse(
                event_id=wh.event_id,
                transaction_id=wh.transaction_id,
                provider=wh.provider,
                event_type=wh.event_type,
                payload=payload_dict,
                received_timestamp=wh.received_timestamp,
                processing_status=wh.processing_status
            )
        )
    return results

def list_all_webhooks(db: Session, limit: int = 50) -> List[WebhookEventResponse]:
    events = (
        db.query(WebhookEvent)
        .order_by(desc(WebhookEvent.received_timestamp))
        .limit(limit)
        .all()
    )
    results = []
    for wh in events:
        try:
            payload_dict = json.loads(wh.payload) if isinstance(wh.payload, str) else wh.payload
        except Exception:
            payload_dict = {"raw": wh.payload}
        results.append(
            WebhookEventResponse(
                event_id=wh.event_id,
                transaction_id=wh.transaction_id,
                provider=wh.provider,
                event_type=wh.event_type,
                payload=payload_dict,
                received_timestamp=wh.received_timestamp,
                processing_status=wh.processing_status
            )
        )
    return results

def record_chaos_run(
    db: Session,
    scenario_id: str,
    case_id: Optional[str] = None,
    order_id: Optional[str] = None
) -> ChaosRunResponse:
    test_id = f"sim-{uuid.uuid4().hex[:8]}"
    
    scenario_names = {
        "duplicate_webhook": "Duplicate Webhook Delivery",
        "delayed_webhook": "Delayed Webhook (120s lag)",
        "missing_webhook": "Dropped Webhook (Permanent 5xx)",
        "signature_mismatch": "Compromised Signature / Tampered Payload"
    }
    scen_name = scenario_names.get(scenario_id, scenario_id)

    results_text = (
        f"Simulated injection of '{scen_name}' for order {order_id or 'ORD_DEFAULT'}. "
        f"Local sandbox verification recorded; live backend harness executes in Phase 2."
    )

    run = ChaosTestRun(
        test_id=test_id,
        case_id=case_id,
        scenario=scen_name,
        status="SIMULATED / BACKEND HARNESS NOT CONNECTED",
        results=results_text,
        created_at=datetime.now(timezone.utc)
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    return ChaosRunResponse(
        test_id=run.test_id,
        case_id=run.case_id,
        scenario=run.scenario,
        status=run.status,
        results=run.results,
        created_at=run.created_at
    )

def list_chaos_history(db: Session, limit: int = 50) -> List[ChaosRunResponse]:
    runs = (
        db.query(ChaosTestRun)
        .order_by(desc(ChaosTestRun.created_at))
        .limit(limit)
        .all()
    )
    return [
        ChaosRunResponse(
            test_id=r.test_id,
            case_id=r.case_id,
            scenario=r.scenario,
            status=r.status,
            results=r.results,
            created_at=r.created_at
        )
        for r in runs
    ]
