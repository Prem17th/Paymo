import json
from unittest.mock import MagicMock, patch
import pytest

from backend.app.core.config import settings
from backend.app.services.agent_service import execute_tool, run_agent_turn, check_openai_availability

def test_tool_check_payment_found(db_session):
    res = execute_tool("check_payment", {"order_id_or_transaction_id": "ORD_9823412"}, db_session)
    assert res["found"] is True
    assert res["order_id"] == "ORD_9823412"
    assert res["transaction_id"] == "cf_tx_90812938"
    assert res["amount"] == 2499.00
    assert "SIMULATED_DEMO_RECORD" in res["note"]

def test_tool_check_payment_not_found(db_session):
    res = execute_tool("check_payment", {"order_id_or_transaction_id": "ORD_NONEXISTENT_999"}, db_session)
    assert res["found"] is False
    assert "No transaction or order record found" in res["message"]

def test_tool_create_case_server_confirmation_enforced(db_session):
    # Model alone cannot authorize state change even if it passes confirmation flags
    conv_id = "conv_unconfirmed_test"
    res = execute_tool(
        name="create_case",
        args={
            "order_id": "ORD_UNCONFIRMED_1",
            "transaction_id": "cf_tx_unconfirmed_1",
            "customer_name": "Unconfirmed User",
            "customer_email": "user@test.com",
            "amount": 1000.0,
            "confirmed": True  # Model asserted True
        },
        db=db_session,
        conversation_id=conv_id,
        raw_user_message="I would like to look into filing an incident."
    )
    assert res["created"] is False
    assert res["server_authorized"] is False
    assert res["status"] == "CONFIRMATION_REQUIRED"
    assert res["action_id"].startswith("act_")
    assert "cannot authorize database writes" in res["message"]


def test_tool_create_case_with_server_validated_durable_action(db_session):
    from backend.app.services.action_service import action_store
    conv_id = "conv_confirmed_test"
    # User's chat message triggers staging, but cannot execute state change directly
    res = execute_tool(
        name="create_case",
        args={
            "order_id": "ORD_CONFIRMED_1",
            "transaction_id": "cf_tx_confirmed_1",
            "customer_name": "Confirmed User",
            "customer_email": "confirmed@test.com",
            "amount": 2500.0
        },
        db=db_session,
        conversation_id=conv_id,
        raw_user_message="YES, please CONFIRM case creation for this order."
    )
    assert res["created"] is False
    assert res["status"] == "CONFIRMATION_REQUIRED"
    action_id = res["action_id"]
    assert action_id.startswith("act_")

    # Explicit server confirmation executes the staged action
    confirm_res = action_store.confirm_action(db_session, conv_id, action_id)
    assert confirm_res["success"] is True
    assert confirm_res["status"] == "CONFIRMED"
    assert "CASE-2024-" in confirm_res["case"].id


def test_blocked_financial_execution_tools(db_session):
    # Verify refunds, payouts, and transfers are rejected
    for blocked in ["process_refund", "execute_payout", "transfer_funds"]:
        res = execute_tool(blocked, {"amount": 500}, db_session)
        assert "ACTION_BLOCKED" in res["error"]

def test_tool_generate_case_report(db_session):
    res = execute_tool("generate_case_report", {"case_id": "CASE-2024-8831"}, db_session)
    assert res["report_generated"] is True
    assert "PAYMO INCIDENT INVESTIGATION REPORT" in res["report_text"]
    assert "VERIFIED FACTS" in res["report_text"]
    assert "POSSIBLE ROOT CAUSES (AI-GENERATED HYPOTHESES)" in res["report_text"]
    assert res["filename"] == "Paymo_Report_CASE-2024-8831.txt"

def test_tool_invalid_argument_handling(db_session):
    res = execute_tool("check_payment", {}, db_session)
    assert "error" in res

def test_agent_audit_status_endpoint(client):
    with patch.object(settings, "OPENAI_API_KEY", ""):
        response = client.get("/api/agent/audit-status")
        assert response.status_code == 200
        data = response.json()
        assert "configured" in data
        assert "reachable" in data
        assert "model" in data
        assert data["configured"] is False
        assert data["status"] == "NOT_CONFIGURED"

def test_agent_chat_api_endpoint_fallback(client):
    with patch.object(settings, "OPENAI_API_KEY", ""):
        conv_id = "conv_test_agent_fallback"
        payload = {
            "message": "Can you check order ORD_9823412?",
            "language": "en"
        }
        response = client.post(f"/api/conversations/{conv_id}/agent-chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["conversation_id"] == conv_id
        assert "ORD_9823412" in data["content"] or "FAILED" in data["content"]
        assert data["is_fallback"] is True
        assert "LOCAL_FALLBACK" in data["execution_engine"]

def test_agent_chat_report_request(client):
    conv_id = "conv_test_report_gen"
    payload = {
        "message": "Generate a report for case CASE-2024-8831",
        "language": "en"
    }
    response = client.post(f"/api/conversations/{conv_id}/agent-chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["report_filename"] == "Paymo_Report_CASE-2024-8831.txt"
    assert "PAYMO INCIDENT INVESTIGATION REPORT" in data["report_text"]

@patch("openai.OpenAI")
def test_agent_openai_mock_tool_calling(mock_openai_class, db_session):
    mock_client = MagicMock()
    mock_openai_class.return_value = mock_client

    tool_call_mock = MagicMock()
    tool_call_mock.id = "call_mock_123"
    tool_call_mock.function.name = "check_payment"
    tool_call_mock.function.arguments = json.dumps({"order_id_or_transaction_id": "ORD_9823412"})

    first_msg_mock = MagicMock()
    first_msg_mock.content = None
    first_msg_mock.tool_calls = [tool_call_mock]

    first_choice_mock = MagicMock()
    first_choice_mock.message = first_msg_mock

    second_msg_mock = MagicMock()
    second_msg_mock.content = "I checked order ORD_9823412. The transaction cf_tx_90812938 shows FAILED status."
    second_msg_mock.tool_calls = None

    second_choice_mock = MagicMock()
    second_choice_mock.message = second_msg_mock

    mock_client.chat.completions.create.side_effect = [
        MagicMock(choices=[first_choice_mock]),
        MagicMock(choices=[second_choice_mock])
    ]

    with patch("backend.app.core.config.settings.OPENAI_API_KEY", "sk-mock-test-key"):
        result = run_agent_turn(
            conversation_id="conv_mock_tool_turn",
            user_message="Check payment for ORD_9823412",
            language="en",
            db=db_session
        )

        assert "ORD_9823412" in result["content"]
        assert result["is_fallback"] is False
        assert "GPT" in result["execution_engine"]
        assert len(result["tools_executed"]) == 1
        assert result["tools_executed"][0]["tool"] == "check_payment"

@patch("openai.OpenAI")
def test_agent_openai_api_error_not_falsely_reported(mock_openai_class, db_session):
    mock_client = MagicMock()
    mock_openai_class.return_value = mock_client
    mock_client.chat.completions.create.side_effect = Exception("OpenAI upstream connection error (500)")

    with patch("backend.app.core.config.settings.OPENAI_API_KEY", "sk-mock-test-key"):
        result = run_agent_turn(
            conversation_id="conv_mock_err_turn",
            user_message="Can you check order ORD_9823412?",
            language="en",
            db=db_session
        )

        # Must NOT be marked as successful GPT response
        assert result["is_fallback"] is True
        assert "LOCAL_FALLBACK" in result["execution_engine"]
        assert "500" in result["fallback_reason"]
