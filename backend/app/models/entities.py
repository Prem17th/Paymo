from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    Index
)
from sqlalchemy.orm import relationship
from backend.app.db.session import Base

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String(64), primary_key=True, index=True)
    display_name = Column(String(100), nullable=False)
    role = Column(String(50), nullable=False) # lead-engineer, support-specialist, finance-lead
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(String(64), primary_key=True, index=True) # e.g. CASE-2024-8831
    customer_id = Column(String(64), nullable=False, index=True)
    customer_name = Column(String(100), nullable=False)
    customer_email = Column(String(150), nullable=False)
    customer_phone = Column(String(50), nullable=True)
    order_id = Column(String(64), nullable=False, index=True)
    transaction_id = Column(String(64), nullable=False, index=True)
    issue_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="OPEN", index=True) # OPEN, INVESTIGATING, RESOLVED, ESCALATED
    assigned_team = Column(String(50), nullable=False, default="Engineering", index=True) # Engineering, Support, Finance
    channel = Column(String(50), nullable=False, default="UPI") # UPI, Cards, Netbanking, Wallet
    amount_paise = Column(Integer, nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="INR")
    source = Column(String(20), nullable=False, default="DEMO") # DEMO or CASHFREE
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    messages = relationship("Message", back_populates="case", cascade="all, delete-orphan")
    timeline_events = relationship("IncidentEvent", back_populates="case", cascade="all, delete-orphan", order_by="IncidentEvent.timestamp.asc()")


class Message(Base):
    __tablename__ = "messages"

    message_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="SET NULL"), nullable=True, index=True)
    conversation_id = Column(String(64), nullable=False, index=True)
    sender_type = Column(String(20), nullable=False) # user, assistant, system
    message_content = Column(Text, nullable=False)
    language = Column(String(20), nullable=False, default="en")
    audio_available = Column(Boolean, default=False)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    case = relationship("Case", back_populates="messages")


class Transaction(Base):
    __tablename__ = "transactions"

    transaction_id = Column(String(64), primary_key=True, index=True)
    order_id = Column(String(64), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    currency = Column(String(10), nullable=False, default="INR")
    payment_status = Column(String(50), nullable=False) # FAILED, CHARGED, SUCCESS, PENDING, REFUNDED
    order_status = Column(String(50), nullable=False, default="PENDING_CONFIRMATION") # PENDING_CONFIRMATION, COMPLETED, CANCELLED, MANUAL_REVIEW
    source = Column(String(20), nullable=False, default="DEMO") # DEMO or CASHFREE
    payment_method = Column(String(50), nullable=False, default="UPI")
    customer_name = Column(String(100), nullable=True)
    customer_email = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    webhook_events = relationship("WebhookEvent", back_populates="transaction", cascade="all, delete-orphan")


class IncidentEvent(Base):
    __tablename__ = "incident_events"

    event_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), ForeignKey("cases.case_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    actor = Column(String(100), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    case = relationship("Case", back_populates="timeline_events")


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    event_id = Column(String(64), primary_key=True, index=True)
    transaction_id = Column(String(64), ForeignKey("transactions.transaction_id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(50), nullable=False, default="CASHFREE")
    event_type = Column(String(100), nullable=False)
    payload = Column(Text, nullable=False) # JSON payload
    received_timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    processing_status = Column(String(50), nullable=False, default="DELIVERED") # DELIVERED, DROPPED, DELAYED, SIGNATURE_FAILED

    transaction = relationship("Transaction", back_populates="webhook_events")


class ChaosTestRun(Base):
    __tablename__ = "chaos_test_runs"

    test_id = Column(String(64), primary_key=True, index=True)
    case_id = Column(String(64), nullable=True, index=True)
    scenario = Column(String(100), nullable=False)
    status = Column(String(50), nullable=False, default="SIMULATED")
    results = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
