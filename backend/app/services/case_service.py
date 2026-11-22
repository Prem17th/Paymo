import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from backend.app.models.entities import Case, IncidentEvent, WebhookEvent, Transaction
from backend.app.schemas.pydantic_schemas import (
    CaseCreateRequest,
    CaseResponse,
    IncidentEventResponse,
    WebhookEventResponse,
    OverviewSummaryResponse,
    TransactionResponse
)

def format_case_response(case: Case, db: Session) -> CaseResponse:
    # Fetch webhooks linked to case transaction_id if any
    webhooks_query = db.query(WebhookEvent).filter(WebhookEvent.transaction_id == case.transaction_id).all()
    webhooks_list = []
    for wh in webhooks_query:
        try:
            payload_dict = json.loads(wh.payload) if isinstance(wh.payload, str) else wh.payload
        except Exception:
            payload_dict = {"raw": wh.payload}
        webhooks_list.append(
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

    timeline_list = [
        IncidentEventResponse(
            event_id=ev.event_id,
            case_id=ev.case_id,
            event_type=ev.event_type,
            description=ev.description,
            actor=ev.actor,
            timestamp=ev.timestamp
        )
        for ev in case.timeline_events
    ]

    # Convert timestamps to display string
    created_dt = case.created_at
    if created_dt.tzinfo is None:
        created_dt = created_dt.replace(tzinfo=timezone.utc)
    date_str = created_dt.strftime("%Y-%m-%d %I:%M %p")
    
    updated_dt = case.updated_at
    if updated_dt.tzinfo is None:
        updated_dt = updated_dt.replace(tzinfo=timezone.utc)
    diff_mins = int((datetime.now(timezone.utc) - updated_dt).total_seconds() / 60)
    if diff_mins < 2:
        last_updated = "Just now"
    elif diff_mins < 60:
        last_updated = f"{diff_mins} mins ago"
    else:
        last_updated = f"{diff_mins // 60} hrs ago"

    return CaseResponse(
        id=case.case_id,
        order_id=case.order_id,
        transaction_id=case.transaction_id,
        customer_name=case.customer_name,
        customer_email=case.customer_email,
        customer_phone=case.customer_phone,
        amount=round(case.amount_paise / 100.0, 2),
        currency=case.currency,
        payment_status=case.issue_type if case.issue_type in ["FAILED", "CHARGED", "SUCCESS", "PENDING", "REFUNDED"] else "FAILED",
        order_status="PENDING_CONFIRMATION",
        investigation_status=case.status,
        assigned_team=case.assigned_team,
        channel=case.channel,
        issue_type=case.issue_type,
        description=case.description,
        date=date_str,
        last_updated=last_updated,
        timeline=timeline_list,
        webhooks=webhooks_list
    )


def get_overview_summary(db: Session) -> OverviewSummaryResponse:
    total_cases = db.query(Case).count()
    open_cases = db.query(Case).filter(Case.status == "OPEN").count()
    resolved_cases = db.query(Case).filter(Case.status == "RESOLVED").count()
    pending_investigations = db.query(Case).filter(Case.status == "INVESTIGATING").count()

    recent_cases_db = db.query(Case).order_by(desc(Case.created_at)).limit(5).all()
    recent_cases = [format_case_response(c, db) for c in recent_cases_db]

    # Real Payments telemetry from SQLite database
    total_payments = db.query(Transaction).count()
    successful_payments = db.query(Transaction).filter(Transaction.payment_status == "SUCCESS").count()
    pending_payments = db.query(Transaction).filter(Transaction.payment_status == "PENDING").count()
    failed_payments = db.query(Transaction).filter(Transaction.payment_status == "FAILED").count()

    # Sum verified amount
    verified_txns = db.query(Transaction).filter(Transaction.payment_status == "SUCCESS").all()
    total_verified_amount = round(sum(t.amount_paise for t in verified_txns) / 100.0, 2)

    # Today's payments (start of today UTC)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_txns = db.query(Transaction).filter(Transaction.created_at >= today_start).all()
    today_payments_count = len(today_txns)
    today_payments_amount = round(sum(t.amount_paise for t in today_txns) / 100.0, 2)

    recent_txns_db = db.query(Transaction).order_by(desc(Transaction.created_at)).limit(10).all()
    recent_transactions = [
        TransactionResponse(
            transaction_id=t.transaction_id,
            order_id=t.order_id,
            amount=round(t.amount_paise / 100.0, 2),
            currency=t.currency,
            payment_status=t.payment_status,
            order_status=t.order_status,
            source=t.source,
            payment_method=t.payment_method,
            customer_name=t.customer_name,
            customer_email=t.customer_email,
            created_at=t.created_at
        )
        for t in recent_txns_db
    ]

    return OverviewSummaryResponse(
        total_cases=total_cases,
        open_cases=open_cases,
        resolved_cases=resolved_cases,
        pending_investigations=pending_investigations,
        recent_cases=recent_cases,
        total_payments=total_payments,
        successful_payments=successful_payments,
        pending_payments=pending_payments,
        failed_payments=failed_payments,
        total_verified_amount=total_verified_amount,
        today_payments_amount=today_payments_amount,
        today_payments_count=today_payments_count,
        recent_transactions=recent_transactions
    )


def list_cases(
    db: Session,
    search: Optional[str] = None,
    status: Optional[str] = None,
    team: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
) -> List[CaseResponse]:
    query = db.query(Case)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Case.case_id.ilike(s),
                Case.order_id.ilike(s),
                Case.transaction_id.ilike(s),
                Case.customer_name.ilike(s),
                Case.customer_email.ilike(s),
                Case.description.ilike(s)
            )
        )

    if status and status != "ALL":
        query = query.filter(Case.status == status)

    if team and team != "ALL":
        query = query.filter(Case.assigned_team == team)

    cases = query.order_by(desc(Case.created_at)).offset(skip).limit(limit).all()
    return [format_case_response(c, db) for c in cases]


def get_case_by_id(db: Session, case_id: str) -> Optional[CaseResponse]:
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return None
    return format_case_response(case, db)


def create_case(db: Session, case_in: CaseCreateRequest) -> CaseResponse:
    # Generate next CASE ID
    count = db.query(Case).count()
    new_case_id = f"CASE-2024-{8832 + count}"

    # Also register transaction if not already present
    existing_txn = db.query(Transaction).filter(Transaction.transaction_id == case_in.transaction_id).first()
    if not existing_txn:
        new_txn = Transaction(
            transaction_id=case_in.transaction_id,
            order_id=case_in.order_id,
            amount_paise=int(round(case_in.amount * 100)),
            currency=case_in.currency or "INR",
            payment_status=case_in.payment_status or "FAILED",
            order_status=case_in.order_status or "PENDING_CONFIRMATION",
            source="DEMO",
            payment_method=case_in.channel or "UPI",
            customer_name=case_in.customer_name,
            customer_email=case_in.customer_email
        )
        db.add(new_txn)

    new_case = Case(
        case_id=new_case_id,
        customer_id=f"cust_{case_in.customer_name.lower().replace(' ', '_')[:20]}",
        customer_name=case_in.customer_name,
        customer_email=case_in.customer_email,
        customer_phone=case_in.customer_phone or "+91 99000 00000",
        order_id=case_in.order_id,
        transaction_id=case_in.transaction_id,
        issue_type=case_in.payment_status or "FAILED",
        description=case_in.description or "Manually logged payment discrepancy incident.",
        status="OPEN",
        assigned_team=case_in.assigned_team or "Engineering",
        channel=case_in.channel or "UPI",
        amount_paise=int(round(case_in.amount * 100)),
        currency=case_in.currency or "INR",
        source="DEMO"
    )
    db.add(new_case)
    db.flush()

    # Add initial timeline event
    init_event = IncidentEvent(
        event_id=f"tl-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        case_id=new_case.case_id,
        event_type="INCIDENT_CREATED",
        description=f"Incident registered and assigned to {new_case.assigned_team}.",
        actor="Operator"
    )
    db.add(init_event)
    db.commit()
    db.refresh(new_case)

    return format_case_response(new_case, db)


def update_case_status(
    db: Session,
    case_id: str,
    status: str,
    reason: Optional[str] = None,
    actor: str = "Lead Engineer"
) -> Optional[CaseResponse]:
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return None

    old_status = case.status
    case.status = status
    case.updated_at = datetime.now(timezone.utc)

    # Add timeline event
    desc = f"Investigation status changed from {old_status} to {status}."
    if reason:
        desc += f" Reason: {reason}"

    event = IncidentEvent(
        event_id=f"tl-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        case_id=case.case_id,
        event_type="STATUS_CHANGED",
        description=desc,
        actor=actor
    )
    db.add(event)
    db.commit()
    db.refresh(case)

    return format_case_response(case, db)


def assign_case_team(
    db: Session,
    case_id: str,
    team: str,
    actor: str = "Lead Engineer"
) -> Optional[CaseResponse]:
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return None

    old_team = case.assigned_team
    case.assigned_team = team
    case.updated_at = datetime.now(timezone.utc)

    event = IncidentEvent(
        event_id=f"tl-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        case_id=case.case_id,
        event_type="REASSIGNED",
        description=f"Case reassigned from {old_team} to {team}.",
        actor=actor
    )
    db.add(event)
    db.commit()
    db.refresh(case)

    return format_case_response(case, db)


def add_incident_event(
    db: Session,
    case_id: str,
    event_type: str,
    description: str,
    actor: str = "Lead Engineer"
) -> Optional[IncidentEventResponse]:
    case = db.query(Case).filter(Case.case_id == case_id).first()
    if not case:
        return None

    event = IncidentEvent(
        event_id=f"tl-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        case_id=case_id,
        event_type=event_type,
        description=description,
        actor=actor
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return IncidentEventResponse(
        event_id=event.event_id,
        case_id=event.case_id,
        event_type=event.event_type,
        description=event.description,
        actor=event.actor,
        timestamp=event.timestamp
    )
