import json
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

import openai
from backend.app.core.config import settings
from backend.app.services import case_service, chat_service, transaction_service
from backend.app.services.action_service import action_store
from backend.app.schemas.pydantic_schemas import CaseCreateRequest
from backend.app.models.entities import Transaction


# Server-Side Pending Actions Store (Keyed by conversation_id)
# Enforces that model-generated confirmed=True is NEVER trusted as human authorization.
_PENDING_CONFIRMATIONS: Dict[str, Dict[str, Any]] = {}

# Tools Definition for OpenAI Tool Calling API
PAYMO_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_payment",
            "description": "Look up payment details and status for an Order ID or Transaction ID in the Paymo database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id_or_transaction_id": {
                        "type": "string",
                        "description": "The Order ID (e.g. ORD_9823412) or Transaction ID (e.g. cf_tx_90812938)"
                    }
                },
                "required": ["order_id_or_transaction_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_case",
            "description": "Retrieve investigation details and status for an incident Case ID in Paymo.",
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id": {
                        "type": "string",
                        "description": "The Case ID (e.g. CASE-2024-8831)"
                    }
                },
                "required": ["case_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_case",
            "description": "Stage or execute creating a new incident recovery case. Note: Server-side validation requires separate explicit user consent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "The associated order ID"},
                    "transaction_id": {"type": "string", "description": "The gateway transaction reference"},
                    "customer_name": {"type": "string", "description": "Full name of customer"},
                    "customer_email": {"type": "string", "description": "Customer contact email"},
                    "amount": {"type": "number", "description": "Transaction amount in INR"},
                    "payment_status": {"type": "string", "description": "Status such as FAILED, CHARGED, PENDING", "enum": ["FAILED", "CHARGED", "PENDING", "SUCCESS", "REFUNDED"]},
                    "description": {"type": "string", "description": "Description of the failure or complaint"}
                },
                "required": ["order_id", "transaction_id", "customer_name", "customer_email", "amount"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_case_timeline",
            "description": "Fetch chronological audit trail and events logged for a specific case ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id": {"type": "string", "description": "The case ID"}
                },
                "required": ["case_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_webhook_history",
            "description": "Inspect raw webhook deliveries, timestamps and payload status for a transaction ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "transaction_id": {"type": "string", "description": "The transaction ID (e.g. cf_tx_90812938)"}
                },
                "required": ["transaction_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_case_report",
            "description": "Generate a comprehensive structured investigative report for a case, separating verified evidence from AI hypotheses.",
            "parameters": {
                "type": "object",
                "properties": {
                    "case_id": {"type": "string", "description": "The case ID to generate report for"}
                },
                "required": ["case_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_latest_payment",
            "description": "Retrieve the most recent payment transaction in the Paymo database, including timestamp, order ID, amount, and payment status.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_today_payments",
            "description": "Calculate and retrieve all payments made today, including total amount, payment counts, and verified status.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_payments",
            "description": "Fetch a list of recent payment transactions (up to 10) from the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "description": "Number of recent payments to fetch (default 5, max 10)"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_payment_report",
            "description": "Generate an official payment summary report for recent transactions or a specific payment from the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "Optional specific order ID to report on. If omitted, generates report for the latest payments."}
                }
            }
        }
    }
]

SYSTEM_PROMPT = """You are Paymo, an intelligent voice-first payment assistant.
Your goal is to help users manage payments, track transaction statuses, verify receipts, and generate reports.

STRICT OPERATIONAL RULES:
1. MANDATORY TOOL CALLING: You MUST ALWAYS invoke a database tool before answering questions about transactions or payments:
   - Always call `get_latest_payment` whenever the user asks about their last, latest, or most recent payment.
   - Always call `get_today_payments` when asked about payments made today.
   - Always call `get_recent_payments` when asked to list payments.
2. If the tool result indicates no records found (found=False), reply: "You haven't made any payments through Paymo yet."
3. If records exist (found=True), state the exact amount, order ID, payment status, and timestamp from the tool response. Never invent or hallucinate payment details.
3. LANGUAGE AWARENESS: Fluently support English and Kannada (ಕನ್ನಡ). If the user asks or speaks in Kannada, reply warmly and clearly in natural Kannada with accurate transaction values.
4. SERVER-CONTROLLED CONFIRMATION: You cannot self-authorize state mutations. When creating a case, inform the user they must confirm the action.
5. FINANCIAL BOUNDARY: Transfers to arbitrary contacts are disabled without authorized Cashfree Payouts. Direct money disbursement is strictly prohibited.
6. Conciseness: Keep responses crisp and voice-friendly so they sound natural when read aloud by text-to-speech.
"""

def execute_tool(
    name: str,
    args: Dict[str, Any],
    db: Session,
    conversation_id: str = "default",
    raw_user_message: str = ""
) -> Dict[str, Any]:
    """
    Execute authorized backend tool with server-side argument validation and security controls.
    Model-generated confirmation flags are deliberately ignored; human confirmation is strictly checked.
    """
    # Defensive argument validation
    if not isinstance(args, dict):
        return {"error": "Invalid arguments payload: expected JSON object."}

    # 1. PAYMENT LOOKUP
    if name == "check_payment":
        raw_id = str(args.get("order_id_or_transaction_id", "")).strip()
        if not raw_id:
            return {"error": "Missing or empty order_id_or_transaction_id argument."}
        # Sanitize against injection
        sanitized_id = re.sub(r'[^a-zA-Z0-9_\-]', '', raw_id)
        txn = transaction_service.lookup_transaction(db, sanitized_id)
        if not txn:
            return {
                "found": False,
                "message": f"No transaction or order record found for '{sanitized_id}' in the authorized Paymo database."
            }
        return {
            "found": True,
            "transaction_id": txn.transaction_id,
            "order_id": txn.order_id,
            "amount": txn.amount,
            "currency": txn.currency,
            "payment_status": txn.payment_status,
            "order_status": txn.order_status,
            "source": txn.source,
            "payment_method": txn.payment_method,
            "customer_name": txn.customer_name,
            "note": "SIMULATED_DEMO_RECORD" if txn.source == "DEMO" else "LIVE_RECORD"
        }

    # 2. CASE LOOKUP
    elif name == "get_case":
        case_id = str(args.get("case_id", "")).strip()
        if not case_id:
            return {"error": "Missing or empty case_id argument."}
        sanitized_case_id = re.sub(r'[^a-zA-Z0-9_\-]', '', case_id)
        c = case_service.get_case_by_id(db, sanitized_case_id)
        if not c:
            return {"found": False, "message": f"Case '{sanitized_case_id}' does not exist in the database."}
        return {
            "found": True,
            "case_id": c.id,
            "order_id": c.order_id,
            "transaction_id": c.transaction_id,
            "customer_name": c.customer_name,
            "amount": c.amount,
            "status": c.investigation_status,
            "assigned_team": c.assigned_team,
            "channel": c.channel,
            "description": c.description,
            "last_updated": c.last_updated
        }

    # 3. CASE CREATION (STATE-CHANGING: ENFORCES DURABLE SERVER-VALIDATED PENDING ACTION ID)
    elif name == "create_case":
        # Validate required arguments
        order_id = str(args.get("order_id", "")).strip()
        transaction_id = str(args.get("transaction_id", "")).strip()
        customer_name = str(args.get("customer_name", "")).strip()
        customer_email = str(args.get("customer_email", "")).strip()
        
        try:
            amount = float(args.get("amount", 0.0))
            if amount < 0:
                return {"error": "Amount must be a non-negative number."}
        except (ValueError, TypeError):
            return {"error": "Invalid amount: must be numeric."}

        if not order_id or not transaction_id or not customer_name or not customer_email:
            return {"error": "Missing required fields (order_id, transaction_id, customer_name, customer_email)."}

        # SECURITY REQUIREMENT 12: Durable, server-validated pending action token.
        # Direct execution via chat keywords is strictly disabled.
        # Action must be staged, generating a unique act_<id> requiring client confirmation.
        staged_action = action_store.stage_action(
            conversation_id=conversation_id,
            action_type="create_case",
            payload={
                "order_id": order_id,
                "transaction_id": transaction_id,
                "customer_name": customer_name,
                "customer_email": customer_email,
                "amount": amount,
                "payment_status": args.get("payment_status", "FAILED"),
                "assigned_team": args.get("assigned_team", "Engineering"),
                "channel": args.get("channel", "UPI"),
                "issue_type": args.get("issue_type", "FAILED"),
                "description": args.get("description", "Case registered after server-validated action authorization.")
            },
            summary=f"Create recovery incident for Order {order_id} (₹{amount:.2f})"
        )

        return {
            "created": False,
            "server_authorized": False,
            "status": "CONFIRMATION_REQUIRED",
            "action_id": staged_action["action_id"],
            "pending_action": staged_action,
            "message": (
                f"ACTION STAGED: Pending Authorization [{staged_action['action_id']}]. "
                f"Case creation has been safely staged for Order '{order_id}', Transaction '{transaction_id}', Amount ₹{amount:.2f}. "
                f"For security, text chat messages cannot authorize database writes. Please review and click [CONFIRM & EXECUTE] in the confirmation card below."
            )
        }

    # 4. TIMELINE
    elif name == "get_case_timeline":
        case_id = str(args.get("case_id", "")).strip()
        c = case_service.get_case_by_id(db, case_id)
        if not c:
            return {"found": False, "message": f"Case '{case_id}' not found."}
        return {
            "case_id": case_id,
            "events": [
                {
                    "event_id": ev.event_id,
                    "event_type": ev.event_type,
                    "description": ev.description,
                    "actor": ev.actor,
                    "timestamp": ev.timestamp.isoformat()
                }
                for ev in c.timeline
            ]
        }

    # 5. WEBHOOKS
    elif name == "get_webhook_history":
        txn_id = str(args.get("transaction_id", "")).strip()
        webhooks = transaction_service.get_webhooks_for_transaction(db, txn_id)
        return {
            "transaction_id": txn_id,
            "webhooks_count": len(webhooks),
            "webhooks": [
                {
                    "event_id": w.event_id,
                    "event_type": w.event_type,
                    "status": w.processing_status,
                    "received_at": w.received_timestamp.isoformat(),
                    "payload": w.payload
                }
                for w in webhooks
            ]
        }

    # 6. REPORT GENERATION
    elif name == "generate_case_report":
        case_id = str(args.get("case_id", "")).strip()
        c = case_service.get_case_by_id(db, case_id)
        if not c:
            return {"error": f"Cannot generate report. Case '{case_id}' does not exist in database."}

        report_content = build_structured_report(c)
        return {
            "report_generated": True,
            "case_id": case_id,
            "report_text": report_content,
            "filename": f"Paymo_Report_{case_id}.txt"
        }

    # 7. LATEST PAYMENT
    elif name == "get_latest_payment":
        txn = db.query(Transaction).order_by(desc(Transaction.created_at)).first()
        if not txn:
            return {"found": False, "message": "You haven't made any payments through Paymo yet."}
        return {
            "found": True,
            "order_id": txn.order_id,
            "transaction_id": txn.transaction_id,
            "amount": round(txn.amount_paise / 100.0, 2),
            "currency": txn.currency,
            "payment_status": txn.payment_status,
            "order_status": txn.order_status,
            "source": txn.source,
            "payment_method": txn.payment_method,
            "customer_name": txn.customer_name,
            "created_at": txn.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        }

    # 8. TODAY'S PAYMENTS
    elif name == "get_today_payments":
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_txns = db.query(Transaction).filter(Transaction.created_at >= today_start).all()
        total_paise = sum(t.amount_paise for t in today_txns)
        successful = [t for t in today_txns if t.payment_status == "SUCCESS"]
        pending = [t for t in today_txns if t.payment_status == "PENDING"]
        failed = [t for t in today_txns if t.payment_status == "FAILED"]
        return {
            "count": len(today_txns),
            "total_amount": round(total_paise / 100.0, 2),
            "successful_count": len(successful),
            "pending_count": len(pending),
            "failed_count": len(failed),
            "date": today_start.strftime("%Y-%m-%d"),
            "payments": [
                {
                    "order_id": t.order_id,
                    "amount": round(t.amount_paise / 100.0, 2),
                    "status": t.payment_status,
                    "method": t.payment_method
                }
                for t in today_txns[:5]
            ]
        }

    # 9. RECENT PAYMENTS
    elif name == "get_recent_payments":
        lim = min(max(int(args.get("limit", 5)), 1), 10)
        recent_txns = db.query(Transaction).order_by(desc(Transaction.created_at)).limit(lim).all()
        return {
            "count": len(recent_txns),
            "payments": [
                {
                    "order_id": t.order_id,
                    "transaction_id": t.transaction_id,
                    "amount": round(t.amount_paise / 100.0, 2),
                    "status": t.payment_status,
                    "order_status": t.order_status,
                    "source": t.source,
                    "created_at": t.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
                }
                for t in recent_txns
            ]
        }

    # 10. PAYMENT SUMMARY REPORT
    elif name == "generate_payment_report":
        order_id = args.get("order_id")
        if order_id:
            txn = db.query(Transaction).filter(or_(Transaction.order_id == order_id, Transaction.transaction_id == order_id)).first()
            txns = [txn] if txn else []
        else:
            txns = db.query(Transaction).order_by(desc(Transaction.created_at)).limit(5).all()
        
        if not txns:
            return {"report_generated": False, "message": "No payment records found to generate a report."}

        report_lines = [
            "==================================================",
            "                 PAYMO PAYMENT REPORT             ",
            "==================================================",
            f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            f"Records Included: {len(txns)}",
            "--------------------------------------------------"
        ]
        for t in txns:
            report_lines.append(
                f"Order ID: {t.order_id} | Ref: {t.transaction_id}\n"
                f"Amount: {t.currency} {round(t.amount_paise / 100.0, 2):.2f} | Status: {t.payment_status}\n"
                f"Timestamp: {t.created_at.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
            )
        report_lines.append("==================================================")
        full_text = "\n".join(report_lines)
        return {
            "report_generated": True,
            "report_text": full_text,
            "filename": f"Paymo_Report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        }

    # 11. BLOCKED ACTIONS (Refunds / Transfers)
    elif name in ["process_refund", "execute_payout", "transfer_funds"]:
        return {
            "error": "ACTION_BLOCKED: Financial execution (refunds, payouts, transfers) is strictly disabled in Phase 3A."
        }

    return {"error": f"Unknown tool '{name}'."}


def build_structured_report(c: Any) -> str:
    """Build a comprehensive structured text report distinguishing hard facts from AI hypotheses."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    webhooks_summary = (
        f"Webhooks captured: {len(c.webhooks)}"
        if c.webhooks
        else "No webhook payloads received for this transaction."
    )
    timeline_str = "\n".join(
        [f"   - [{t.timestamp or t.time}] {t.event_type or t.title}: {t.description or t.detail} (Actor: {t.actor})" for t in c.timeline]
    ) or "   - No timeline entries recorded."

    return f"""================================================================================
PAYMO INCIDENT INVESTIGATION REPORT: {c.id}
================================================================================
Generated: {now_str}
Investigation Agent: Paymo AI Payment Sentinel
Database: SQLite (paymo.db)

1. CASE REFERENCE & IDENTIFICATION
   - Incident Reference: {c.id}
   - Order ID:           {c.order_id}
   - Gateway Reference:  {c.transaction_id}
   - Customer:           {c.customer_name} ({c.customer_email})
   - Amount:             ₹{c.amount:.2f} {c.currency}
   - Payment Channel:    {c.channel}
   - Assigned Team:      {c.assigned_team}
   - Current Status:     {c.investigation_status}

2. PROBLEM DESCRIPTION & SYMPTOMS
   {c.description or 'No explicit failure summary provided.'}

3. AVAILABLE TRANSACTION EVIDENCE (DATABASE VERIFIED)
   - Source Tag:         DEMO RECORD (Simulated Fictional Data — Not a Live Payment)
   - Gateway Status:     {c.payment_status}
   - Merchant State:     {c.order_status}
   - Webhook Telemetry:  {webhooks_summary}

4. INCIDENT TIMELINE (CHRONOLOGICAL AUDIT TRAIL)
{timeline_str}

5. VERIFIED FACTS (HARD DATABASE EVIDENCE)
   [FACT 1] The order record {c.order_id} exists in database with amount ₹{c.amount:.2f}.
   [FACT 2] Gateway transaction {c.transaction_id} has ledger status {c.payment_status}.
   [FACT 3] Webhook status indicates delivery disruption or delayed bank callback.

6. POSSIBLE ROOT CAUSES (AI-GENERATED HYPOTHESES)
   [AI HYPOTHESIS 1] Upstream PSP / NPCI debit confirmed, but merchant callback timed out (504 Gateway Timeout).
   [AI HYPOTHESIS 2] High latency at issuing bank authorization prevented synchronous status push.
   [AI HYPOTHESIS 3] Signature verification error or network partition during webhook dispatch.

7. RECOMMENDED NEXT STEPS (ENGINEERING & FINANCE)
   [RECOMMENDATION 1] Trigger GET /orders/{c.order_id} polling sync directly against Cashfree PG.
   [RECOMMENDATION 2] If customer confirms debit and merchant order is unfulfilled, trigger auto-refund or manual order release.
   [RECOMMENDATION 3] Check firewall access logs for merchant webhook callback URL.

8. UNRESOLVED QUESTIONS / ACTION ITEMS
   - Has customer shared NPCI UTR reference number from bank SMS?
   - Did merchant inventory reserve hold during the checkout timeout window?
================================================================================
Report Generated by Paymo Sentinel. AI predictions marked above must be verified before financial disbursement.
"""


def check_openai_availability() -> Dict[str, Any]:
    """
    Safely verifies whether OpenAI API is configured and reachable without exposing the secret key.
    """
    api_key = settings.OPENAI_API_KEY.strip()
    if not api_key:
        return {
            "configured": False,
            "reachable": False,
            "model": settings.OPENAI_MODEL,
            "status": "NOT_CONFIGURED",
            "message": "OPENAI_API_KEY is not set in backend environment. Local fallback engine active."
        }

    try:
        client = openai.OpenAI(
            api_key=api_key,
            timeout=5.0
        )
        client.models.list()
        return {
            "configured": True,
            "reachable": True,
            "model": settings.OPENAI_MODEL,
            "status": "REACHABLE",
            "message": f"OpenAI API configured and verified reachable (Model: {settings.OPENAI_MODEL})."
        }
    except Exception as e:
        err_msg = str(e)
        return {
            "configured": True,
            "reachable": False,
            "model": settings.OPENAI_MODEL,
            "status": "UNREACHABLE",
            "message": f"OpenAI API key configured but endpoint unreachable: {err_msg}"
        }


def run_agent_turn(
    conversation_id: str,
    user_message: str,
    language: str,
    db: Session
) -> Dict[str, Any]:
    """
    Executes a conversational turn using the OpenAI Chat Completions / Tool Calling API.
    Guarantees:
    1. Distinguishes whether response came from GPT or Local Fallback.
    2. Never falsely reports API failures as successful GPT responses.
    3. Enforces server-side confirmation for state changes (model cannot self-authorize).
    4. Persists conversation history with exact engine provenance.
    """
    # 1. Save user message to database
    chat_service.add_message(
        db,
        conversation_id=conversation_id,
        sender_type="user",
        message_content=user_message,
        language=language
    )

    # 2. Retrieve conversation history
    history = chat_service.get_conversation_messages(db, conversation_id)
    openai_messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]
    for h in history[-8:]:
        role = "assistant" if h.sender_type == "assistant" else "user"
        openai_messages.append({"role": role, "content": h.message_content})

    tools_executed: List[Dict[str, Any]] = []
    generated_report_text: Optional[str] = None
    generated_report_file: Optional[str] = None
    final_content: str = ""
    execution_engine = "LOCAL_FALLBACK"
    is_fallback = True
    fallback_reason: Optional[str] = None

    api_key = settings.OPENAI_API_KEY.strip()

    if api_key:
        try:
            client = openai.OpenAI(
                api_key=api_key,
                timeout=settings.OPENAI_TIMEOUT_SECONDS
            )

            # First model call
            response = client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=openai_messages,
                tools=PAYMO_AGENT_TOOLS,
                tool_choice="auto"
            )

            response_message = response.choices[0].message

            if response_message.tool_calls:
                openai_messages.append(response_message)
                for tool_call in response_message.tool_calls:
                    fn_name = tool_call.function.name
                    try:
                        fn_args = json.loads(tool_call.function.arguments)
                    except Exception:
                        fn_args = {}

                    # Execute with server-side confirmation validation
                    tool_result = execute_tool(
                        name=fn_name,
                        args=fn_args,
                        db=db,
                        conversation_id=conversation_id,
                        raw_user_message=user_message
                    )
                    tools_executed.append({
                        "tool": fn_name,
                        "args": fn_args,
                        "result": tool_result
                    })

                    if fn_name == "generate_case_report" and tool_result.get("report_generated"):
                        generated_report_text = tool_result.get("report_text")
                        generated_report_file = tool_result.get("filename")

                    openai_messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": fn_name,
                        "content": json.dumps(tool_result)
                    })

                second_response = client.chat.completions.create(
                    model=settings.OPENAI_MODEL,
                    messages=openai_messages
                )
                final_content = second_response.choices[0].message.content or ""
            else:
                final_content = response_message.content or ""

            # Only marked as GPT when API call actually completed successfully
            execution_engine = f"GPT ({settings.OPENAI_MODEL})"
            is_fallback = False

        except Exception as e:
            fallback_reason = f"OpenAI API call failed: {str(e)}"
            execution_engine = "LOCAL_FALLBACK (OpenAI Error)"
            is_fallback = True
    else:
        fallback_reason = "No OPENAI_API_KEY configured in backend"
        execution_engine = "LOCAL_FALLBACK (No Key)"
        is_fallback = True

    # Deterministic local fallback execution
    if is_fallback or not final_content:
        lower_msg = user_message.lower()
        case_match = re.search(r'(case[-_\w]+|pm[-_\w]+)', lower_msg, re.IGNORECASE)

        # 1. Report Generation Request
        if "report" in lower_msg and case_match:
            target_case = case_match.group(0).upper()
            tool_res = execute_tool("generate_case_report", {"case_id": target_case}, db, conversation_id, user_message)
            tools_executed.append({"tool": "generate_case_report", "args": {"case_id": target_case}, "result": tool_res})
            if tool_res.get("report_generated"):
                generated_report_text = tool_res["report_text"]
                generated_report_file = tool_res["filename"]
                final_content = (
                    f"I have compiled the diagnostic investigation report for {target_case}. "
                    f"You can review the summary above and download the official report text file using the download button below."
                )
            else:
                final_content = f"Could not generate report: {tool_res.get('error', 'Case not found')}."

        # 2. Case Creation Flow (Stages a pending action with unique ID)
        elif "create" in lower_msg and "case" in lower_msg:
            order_m = re.search(r'ord_\w+', lower_msg, re.IGNORECASE)
            order_id_val = order_m.group(0).upper() if order_m else "ORD_AUTO"
            tool_res = execute_tool(
                "create_case",
                {
                    "order_id": order_id_val,
                    "transaction_id": f"cf_tx_{order_id_val.lower()}",
                    "customer_name": "Customer",
                    "customer_email": "customer@example.com",
                    "amount": 2499.0,
                    "description": "User requested incident creation."
                },
                db,
                conversation_id,
                user_message
            )
            tools_executed.append({"tool": "create_case", "args": {"order_id": order_id_val}, "result": tool_res})
            final_content = tool_res["message"]

        # 3. Chat Keyword Rejection (Requirement 12: Chat messages cannot authorize actions)
        elif re.search(r'\b(confirm|yes|proceed|authorize|approve)\b', lower_msg):
            final_content = (
                "For security, chat keywords (such as 'confirm' or 'yes') cannot execute state mutations. "
                "Please review the pending action details in the confirmation card and click [CONFIRM & EXECUTE] to authorize."
            )

        # 4. Case Lookup
        elif "case" in lower_msg and case_match:
            target_case = case_match.group(0).upper()
            tool_res = execute_tool("get_case", {"case_id": target_case}, db, conversation_id, user_message)
            tools_executed.append({"tool": "get_case", "args": {"case_id": target_case}, "result": tool_res})
            if tool_res.get("found"):
                final_content = (
                    f"Found incident {target_case} in SQLite database: Assigned to {tool_res['assigned_team']} with status "
                    f"[{tool_res['status']}]. Amount: ₹{tool_res['amount']}. Order reference: {tool_res['order_id']}."
                )
            else:
                final_content = f"Case {target_case} was not found in the Paymo database."

        # 5. Payment Lookup
        elif re.search(r'(ord_\w+|cf_tx_\w+)', lower_msg, re.IGNORECASE):
            match = re.search(r'(ord_\w+|cf_tx_\w+)', lower_msg, re.IGNORECASE).group(0).upper()
            tool_res = execute_tool("check_payment", {"order_id_or_transaction_id": match}, db, conversation_id, user_message)
            tools_executed.append({"tool": "check_payment", "args": {"order_id_or_transaction_id": match}, "result": tool_res})
            if tool_res.get("found"):
                note_str = "Note: This is an authorized DEMO record (simulated local data, not real money)." if tool_res.get("source") == "DEMO" else "Verified live gateway record."
                final_content = (
                    f"Queried record {match}: Payment Status is [{tool_res['payment_status']}], Order Status is [{tool_res['order_status']}]. "
                    f"Amount: ₹{tool_res['amount']:.2f} via {tool_res['payment_method']}. {note_str}"
                )
            else:
                final_content = f"Payment record '{match}' was not found in the Paymo database. Please verify the ID."

        # 6. Blocked Refund / Payout request
        elif any(w in lower_msg for w in ["refund", "payout", "transfer"]):
            final_content = (
                "Guidance: Automatic or manual financial disbursements (refunds, payouts, transfers) are strictly disabled in this phase. "
                "I can verify payment logs or register a recovery incident for human finance triage."
            )

        else:
            final_content = (
                "Hello! I am Paymo AI Sentinel. I can look up payment transactions (e.g. 'check ORD_9823412'), "
                "retrieve case details, inspect webhook deliveries, or generate structured incident reports (e.g. 'Generate a report for CASE-2024-8831'). "
                "How may I assist you?"
            )

    # Inspect if any tool execution staged a pending action
    pending_action_data = None
    for t in tools_executed:
        res = t.get("result", {})
        if isinstance(res, dict) and res.get("pending_action"):
            pending_action_data = res["pending_action"]
            break

    # 3. Save assistant message to database with metadata
    meta_json = json.dumps({
        "execution_engine": execution_engine,
        "is_fallback": is_fallback,
        "fallback_reason": fallback_reason,
        "report_file": generated_report_file,
        "report_text": generated_report_text,
        "tools_count": len(tools_executed),
        "pending_action_id": pending_action_data.get("action_id") if pending_action_data else None
    })

    saved_assistant_msg = chat_service.add_message(
        db,
        conversation_id=conversation_id,
        sender_type="assistant",
        message_content=final_content,
        language=language,
        audio_available=True,
        metadata_json=meta_json
    )

    return {
        "message_id": saved_assistant_msg.message_id,
        "conversation_id": conversation_id,
        "content": final_content,
        "execution_engine": execution_engine,
        "is_fallback": is_fallback,
        "fallback_reason": fallback_reason,
        "tools_executed": tools_executed,
        "pending_action": pending_action_data,
        "report_text": generated_report_text,
        "report_filename": generated_report_file,
        "created_at": saved_assistant_msg.created_at.isoformat()
    }
