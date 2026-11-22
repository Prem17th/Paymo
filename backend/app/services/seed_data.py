import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from backend.app.models.entities import (
    User,
    Case,
    Transaction,
    IncidentEvent,
    WebhookEvent,
    Message,
    ChaosTestRun,
)

def run_seed(db: Session):
    """
    Idempotent seed script to populate realistic fictional DEMO dataset.
    Checks existing primary keys before insertion to prevent duplicates.
    """
    # 1. Users
    users_data = [
        {"id": "usr_lead_eng", "display_name": "Dev Sharma", "role": "lead-engineer"},
        {"id": "usr_support_01", "display_name": "Ananya Joshi", "role": "support-specialist"},
        {"id": "usr_finance_01", "display_name": "Rohan Mehta", "role": "finance-lead"},
    ]
    for u in users_data:
        if not db.query(User).filter(User.id == u["id"]).first():
            db.add(User(**u, created_at=datetime.now(timezone.utc)))

    # 2. Transactions
    now = datetime.now(timezone.utc)
    txns_data = [
        {
            "transaction_id": "cf_tx_90812938",
            "order_id": "ORD_9823412",
            "amount_paise": 249900,
            "currency": "INR",
            "payment_status": "FAILED",
            "order_status": "PENDING_CONFIRMATION",
            "source": "DEMO",
            "payment_method": "UPI",
            "customer_name": "Aarav Sharma",
            "customer_email": "aarav.sharma@example.com",
            "created_at": now - timedelta(hours=2)
        },
        {
            "transaction_id": "cf_tx_90812844",
            "order_id": "ORD_9823290",
            "amount_paise": 1450000,
            "currency": "INR",
            "payment_status": "CHARGED",
            "order_status": "MANUAL_REVIEW",
            "source": "DEMO",
            "payment_method": "Cards",
            "customer_name": "Priya Sundaram",
            "customer_email": "priya.s@example.org",
            "created_at": now - timedelta(hours=4)
        },
        {
            "transaction_id": "cf_tx_90811901",
            "order_id": "ORD_9822981",
            "amount_paise": 82000,
            "currency": "INR",
            "payment_status": "REFUNDED",
            "order_status": "CANCELLED",
            "source": "DEMO",
            "payment_method": "UPI",
            "customer_name": "Kavita Reddy",
            "customer_email": "kavita.r@techcorp.in",
            "created_at": now - timedelta(days=1)
        },
        {
            "transaction_id": "cf_tx_90810112",
            "order_id": "ORD_9821900",
            "amount_paise": 560000,
            "currency": "INR",
            "payment_status": "FAILED",
            "order_status": "PENDING_CONFIRMATION",
            "source": "DEMO",
            "payment_method": "Netbanking",
            "customer_name": "Rahul Verma",
            "customer_email": "rahul.verma@domain.co",
            "created_at": now - timedelta(days=1, hours=3)
        },
        {
            "transaction_id": "cf_tx_90809823",
            "order_id": "ORD_9821744",
            "amount_paise": 119900,
            "currency": "INR",
            "payment_status": "SUCCESS",
            "order_status": "COMPLETED",
            "source": "DEMO",
            "payment_method": "UPI",
            "customer_name": "Meera Iyer",
            "customer_email": "meera.iyer@webmail.in",
            "created_at": now - timedelta(days=2)
        }
    ]
    for tx in txns_data:
        if not db.query(Transaction).filter(Transaction.transaction_id == tx["transaction_id"]).first():
            db.add(Transaction(**tx))

    # 3. Cases
    cases_data = [
        {
            "case_id": "CASE-2024-8831",
            "customer_id": "cust_aarav_sharma",
            "customer_name": "Aarav Sharma",
            "customer_email": "aarav.sharma@example.com",
            "customer_phone": "+91 98765 43210",
            "order_id": "ORD_9823412",
            "transaction_id": "cf_tx_90812938",
            "issue_type": "FAILED",
            "description": "UPI VPA debit success, webhook delivery timeout exceeded (504 Gateway Timeout).",
            "status": "OPEN",
            "assigned_team": "Engineering",
            "channel": "UPI",
            "amount_paise": 249900,
            "currency": "INR",
            "source": "DEMO",
            "created_at": now - timedelta(hours=2),
            "updated_at": now - timedelta(minutes=12)
        },
        {
            "case_id": "CASE-2024-8830",
            "customer_id": "cust_priya_sundaram",
            "customer_name": "Priya Sundaram",
            "customer_email": "priya.s@example.org",
            "customer_phone": "+91 94440 12345",
            "order_id": "ORD_9823290",
            "transaction_id": "cf_tx_90812844",
            "issue_type": "CHARGED",
            "description": "Customer reported debit; 3DS authorization delayed by issuing bank.",
            "status": "INVESTIGATING",
            "assigned_team": "Finance",
            "channel": "Cards",
            "amount_paise": 1450000,
            "currency": "INR",
            "source": "DEMO",
            "created_at": now - timedelta(hours=4),
            "updated_at": now - timedelta(hours=1)
        },
        {
            "case_id": "CASE-2024-8829",
            "customer_id": "cust_kavita_reddy",
            "customer_name": "Kavita Reddy",
            "customer_email": "kavita.r@techcorp.in",
            "customer_phone": "+91 99887 66554",
            "order_id": "ORD_9822981",
            "transaction_id": "cf_tx_90811901",
            "issue_type": "REFUNDED",
            "description": "Duplicate payment on retry. Auto-refund initiated for second capture.",
            "status": "RESOLVED",
            "assigned_team": "Support",
            "channel": "UPI",
            "amount_paise": 82000,
            "currency": "INR",
            "source": "DEMO",
            "created_at": now - timedelta(days=1),
            "updated_at": now - timedelta(hours=18)
        },
        {
            "case_id": "CASE-2024-8828",
            "customer_id": "cust_rahul_verma",
            "customer_name": "Rahul Verma",
            "customer_email": "rahul.verma@domain.co",
            "customer_phone": "+91 97112 33445",
            "order_id": "ORD_9821900",
            "transaction_id": "cf_tx_90810112",
            "issue_type": "FAILED",
            "description": "Netbanking callback signature validation mismatch.",
            "status": "ESCALATED",
            "assigned_team": "Engineering",
            "channel": "Netbanking",
            "amount_paise": 560000,
            "currency": "INR",
            "source": "DEMO",
            "created_at": now - timedelta(days=1, hours=3),
            "updated_at": now - timedelta(days=1)
        },
        {
            "case_id": "CASE-2024-8827",
            "customer_id": "cust_meera_iyer",
            "customer_name": "Meera Iyer",
            "customer_email": "meera.iyer@webmail.in",
            "customer_phone": "+91 98200 98200",
            "order_id": "ORD_9821744",
            "transaction_id": "cf_tx_90809823",
            "issue_type": "SUCCESS",
            "description": "Delayed webhook cleared after secondary poller execution.",
            "status": "RESOLVED",
            "assigned_team": "Support",
            "channel": "UPI",
            "amount_paise": 119900,
            "currency": "INR",
            "source": "DEMO",
            "created_at": now - timedelta(days=2),
            "updated_at": now - timedelta(days=1, hours=20)
        }
    ]
    for c in cases_data:
        if not db.query(Case).filter(Case.case_id == c["case_id"]).first():
            db.add(Case(**c))

    # 4. Incident Timeline Events
    events_data = [
        ("tl-8831-01", "CASE-2024-8831", "PAYMENT_INITIATED", "User approved PSP prompt on PhonePe UPI.", "Customer", now - timedelta(hours=2)),
        ("tl-8831-02", "CASE-2024-8831", "NPCI_DEBIT", "NPCI reference #329188401948 - amount debited from HDFC Bank.", "Cashfree PG", now - timedelta(hours=2, seconds=-15)),
        ("tl-8831-03", "CASE-2024-8831", "WEBHOOK_FAILED", "Merchant endpoint https://api.store.com/webhooks/cashfree timed out after 30s.", "Cashfree Webhook Service", now - timedelta(hours=2, seconds=-60)),
        ("tl-8831-04", "CASE-2024-8831", "INCIDENT_AUTO_CREATED", "Discrepancy detected: Gateway status is SUCCESS, merchant Order status is PENDING.", "Paymo Sentinel", now - timedelta(hours=1, minutes=45)),

        ("tl-8830-01", "CASE-2024-8830", "3DS_CHALLENGE", "OTP verification delayed by SBI cards gateway.", "Customer", now - timedelta(hours=4)),
        ("tl-8830-02", "CASE-2024-8830", "LATE_AUTH", "Authorization code: AUTH_994109 received after browser checkout session expired.", "Acquiring Bank", now - timedelta(hours=3, minutes=40)),

        ("tl-8829-01", "CASE-2024-8829", "DUPLICATE_IDENTIFIED", "Two debits recorded against same merchant cart ID.", "Paymo Ledger", now - timedelta(days=1)),
        ("tl-8829-02", "CASE-2024-8829", "REFUND_DISPATCHED", "Refund reference #RF_39201948 completed successfully.", "Finance", now - timedelta(days=1, seconds=-70)),
    ]
    for ev_id, case_id, ev_type, desc, actor, ts in events_data:
        if not db.query(IncidentEvent).filter(IncidentEvent.event_id == ev_id).first():
            db.add(IncidentEvent(
                event_id=ev_id,
                case_id=case_id,
                event_type=ev_type,
                description=desc,
                actor=actor,
                timestamp=ts
            ))

    # 5. Webhook Events
    webhooks_data = [
        (
            "wh-8831-01",
            "cf_tx_90812938",
            "CASHFREE",
            "PAYMENT_SUCCESS_WEBHOOK",
            json.dumps({
                "event_time": (now - timedelta(hours=2)).isoformat(),
                "type": "PAYMENT_SUCCESS_WEBHOOK",
                "data": {
                    "order": {"order_id": "ORD_9823412", "order_amount": 2499.00, "order_currency": "INR"},
                    "payment": {"payment_id": "cf_tx_90812938", "payment_status": "SUCCESS", "payment_group": "upi"}
                }
            }),
            now - timedelta(hours=2),
            "DROPPED"
        ),
        (
            "wh-8830-01",
            "cf_tx_90812844",
            "CASHFREE",
            "PAYMENT_DELAYED_CONFIRMATION",
            json.dumps({
                "event_time": (now - timedelta(hours=4)).isoformat(),
                "type": "PAYMENT_DELAYED_CONFIRMATION",
                "data": {"order_id": "ORD_9823290", "auth_code": "AUTH_994109", "amount": 14500.00}
            }),
            now - timedelta(hours=4),
            "DELAYED"
        ),
        (
            "wh-8829-01",
            "cf_tx_90811901",
            "CASHFREE",
            "REFUND_PROCESSED",
            json.dumps({
                "event_time": (now - timedelta(days=1)).isoformat(),
                "type": "REFUND_PROCESSED",
                "refund_id": "RF_39201948",
                "amount": 820.00
            }),
            now - timedelta(days=1),
            "DELIVERED"
        )
    ]
    for wh_id, txn_id, prov, ev_type, payload, rec_ts, status in webhooks_data:
        if not db.query(WebhookEvent).filter(WebhookEvent.event_id == wh_id).first():
            db.add(WebhookEvent(
                event_id=wh_id,
                transaction_id=txn_id,
                provider=prov,
                event_type=ev_type,
                payload=payload,
                received_timestamp=rec_ts,
                processing_status=status
            ))

    # 6. Default Assistant Conversation & Messages
    conv_id = "conv_default_demo"
    msgs_data = [
        (
            "msg_init_01",
            conv_id,
            "assistant",
            "Hello! I am Paymo Assist, your multilingual payment verification companion. If you were debited but your order failed, enter your transaction ID or upload a screenshot of your payment receipt below.",
            "en",
            True,
            None,
            now - timedelta(minutes=30)
        ),
        (
            "msg_init_02",
            conv_id,
            "user",
            "My account was debited ₹2,499 via UPI for order ORD_9823412, but the app says payment failed. Please check!",
            "en",
            False,
            None,
            now - timedelta(minutes=28)
        ),
        (
            "msg_init_03",
            conv_id,
            "assistant",
            "[DEMO RESPONSE] I have correlated your order ORD_9823412 with Cashfree payment cf_tx_90812938. The funds were successfully debited from your bank account, but the store server timed out receiving the webhook confirmation. A recovery case (CASE-2024-8831) has been created and assigned to Engineering for reconciliation.",
            "en",
            True,
            json.dumps({
                "orderId": "ORD_9823412",
                "transactionId": "cf_tx_90812938",
                "amount": 2499.00,
                "status": "GATEWAY_SUCCESS_MERCHANT_TIMEOUT"
            }),
            now - timedelta(minutes=28)
        )
    ]
    for msg_id, c_id, sender, content, lang, audio, meta, ts in msgs_data:
        if not db.query(Message).filter(Message.message_id == msg_id).first():
            db.add(Message(
                message_id=msg_id,
                conversation_id=c_id,
                case_id="CASE-2024-8831",
                sender_type=sender,
                message_content=content,
                language=lang,
                audio_available=audio,
                metadata_json=meta,
                created_at=ts
            ))

    # 7. Chaos Runs
    chaos_data = [
        (
            "sim-init-01",
            "CASE-2024-8830",
            "Delayed Webhook (120s lag)",
            "SIMULATED / BACKEND HARNESS NOT CONNECTED",
            "Evaluated synthetic lag against timeout threshold. Client timer expired at 30s.",
            now - timedelta(hours=3)
        )
    ]
    for t_id, case_id, scen, status, res, ts in chaos_data:
        if not db.query(ChaosTestRun).filter(ChaosTestRun.test_id == t_id).first():
            db.add(ChaosTestRun(
                test_id=t_id,
                case_id=case_id,
                scenario=scen,
                status=status,
                results=res,
                created_at=ts
            ))

    db.commit()
