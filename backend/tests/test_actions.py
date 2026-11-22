import pytest
from datetime import datetime, timezone, timedelta
from backend.app.services.action_service import action_store
from backend.app.services import case_service


def test_action_store_staging_and_lifecycle(db_session):
    conv_id = "conv_test_action_1"
    payload = {
        "order_id": "ORD_SEC_101",
        "transaction_id": "cf_tx_sec_101",
        "customer_name": "Test User",
        "customer_email": "test@example.com",
        "amount": 1500.0,
        "payment_status": "FAILED"
    }

    # 1. Staging creates durable token act_<hex>
    staged = action_store.stage_action(
        conversation_id=conv_id,
        action_type="create_case",
        payload=payload,
        summary="Create test incident for ORD_SEC_101"
    )

    action_id = staged["action_id"]
    assert action_id.startswith("act_")
    assert staged["status"] == "PENDING"
    assert staged["conversation_id"] == conv_id

    # 2. Lookup works
    fetched = action_store.get_action(action_id)
    assert fetched is not None
    assert fetched["action_id"] == action_id

    # 3. Cross-conversation execution protection
    cross_res = action_store.confirm_action(db_session, "conv_wrong_hacker", action_id)
    assert cross_res["success"] is False
    assert "does not belong" in cross_res["error"]

    # 4. Correct confirmation executes action
    confirm_res = action_store.confirm_action(db_session, conv_id, action_id)
    assert confirm_res["success"] is True
    assert confirm_res["status"] == "CONFIRMED"
    assert confirm_res["case"] is not None
    assert confirm_res["case"].order_id == "ORD_SEC_101"

    # 5. Cannot confirm twice
    replay_res = action_store.confirm_action(db_session, conv_id, action_id)
    assert replay_res["success"] is False
    assert "already in 'CONFIRMED' state" in replay_res["error"]


def test_action_cancellation(db_session):
    conv_id = "conv_test_action_cancel"
    payload = {
        "order_id": "ORD_CANCEL_99",
        "transaction_id": "cf_tx_cancel_99",
        "customer_name": "Cancel User",
        "customer_email": "cancel@example.com",
        "amount": 999.0
    }

    staged = action_store.stage_action(conv_id, "create_case", payload, "Cancel test")
    action_id = staged["action_id"]

    # Cancel action
    cancel_res = action_store.cancel_action(conv_id, action_id)
    assert cancel_res["success"] is True
    assert cancel_res["status"] == "CANCELLED"

    # Confirming cancelled action must fail
    confirm_res = action_store.confirm_action(db_session, conv_id, action_id)
    assert confirm_res["success"] is False
    assert "already in 'CANCELLED' state" in confirm_res["error"]


def test_action_expiration(db_session):
    conv_id = "conv_test_expired"
    payload = {
        "order_id": "ORD_EXPIRE_88",
        "transaction_id": "cf_tx_expire_88",
        "customer_name": "Expire User",
        "customer_email": "expire@example.com",
        "amount": 500.0
    }

    staged = action_store.stage_action(conv_id, "create_case", payload, "Expire test")
    action_id = staged["action_id"]

    # Artificially expire action
    action_store._actions[action_id]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(minutes=1)
    ).isoformat()

    confirm_res = action_store.confirm_action(db_session, conv_id, action_id)
    assert confirm_res["success"] is False
    assert "expired" in confirm_res["error"].lower()


def test_unrelated_chat_messages_cannot_authorize_actions(client, db_session):
    """
    SECURITY REQUIREMENT 12: Ensure unrelated chat messages cannot authorize actions.
    Chatting 'yes', 'confirm', 'proceed', or 'create case' cannot directly mutate the database.
    Only the explicit POST /actions/{action_id}/confirm endpoint can execute the staged action.
    """
    import uuid
    from unittest.mock import patch
    from backend.app.core.config import settings

    with patch.object(settings, "OPENAI_API_KEY", ""):
        uid = uuid.uuid4().hex[:6]
        conv_id = f"conv_test_chat_safety_{uid}"
        test_ord = f"ORD_SAFE_{uid}"

        # 1. Ask agent to create case -> returns staged action, DOES NOT create case in DB
        resp = client.post(
            f"/api/conversations/{conv_id}/agent-chat",
            json={"message": f"Please create a case for order {test_ord}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["pending_action"] is not None
        action_id = data["pending_action"]["action_id"]
        assert action_id.startswith("act_")

        # Verify no case was written to database
        cases = case_service.list_cases(db_session, search=test_ord)
        assert len(cases) == 0, "Case must NOT exist before server authorization token is confirmed!"

        # 2. User sends random chat messages saying 'confirm', 'yes', 'proceed'
        chat_confirm_resp = client.post(
            f"/api/conversations/{conv_id}/agent-chat",
            json={"message": "yes, confirm please"}
        )
        assert chat_confirm_resp.status_code == 200
        confirm_text = chat_confirm_resp.json()["content"]
        # Chat must reject inline authorization
        assert "cannot execute state mutations" in confirm_text or "cannot authorize" in confirm_text.lower()

        # Verify database STILL has 0 cases created
        cases = case_service.list_cases(db_session, search=test_ord)
        assert len(cases) == 0, "Chat message MUST NOT authorize database write!"

        # 3. Only the explicit API endpoint can confirm the action token
        endpoint_confirm = client.post(f"/api/conversations/{conv_id}/actions/{action_id}/confirm")
        assert endpoint_confirm.status_code == 200
        confirm_result = endpoint_confirm.json()
        assert confirm_result["success"] is True
        assert confirm_result["status"] == "CONFIRMED"

        # Now verify the case was legitimately created
        cases = case_service.list_cases(db_session, search=test_ord)
        assert len(cases) == 1, "Case must exist after explicit token confirmation!"


