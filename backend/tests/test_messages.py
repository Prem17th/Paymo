import pytest

def test_messages_persistence(client):
    conv_id = "conv_test_session_101"

    # 1. Send user message
    user_msg_payload = {
        "sender_type": "user",
        "message_content": "I was debited Rs 1,499 for order ORD_PYTEST_01, but payment failed.",
        "language": "en"
    }
    res1 = client.post(f"/api/conversations/{conv_id}/messages", json=user_msg_payload)
    assert res1.status_code == 201
    m1 = res1.json()
    assert m1["conversation_id"] == conv_id
    assert m1["sender_type"] == "user"

    # 2. Send assistant response
    asst_msg_payload = {
        "sender_type": "assistant",
        "message_content": "[DEMO RESPONSE] Correlated transaction cf_tx_test_01 with gateway.",
        "language": "en",
        "case_id": "CASE-2024-8831"
    }
    res2 = client.post(f"/api/conversations/{conv_id}/messages", json=asst_msg_payload)
    assert res2.status_code == 201
    m2 = res2.json()
    assert m2["sender_type"] == "assistant"
    assert m2["audio_available"] is True

    # 3. Retrieve conversation history
    res3 = client.get(f"/api/conversations/{conv_id}/messages")
    assert res3.status_code == 200
    messages = res3.json()
    assert len(messages) >= 2
    assert messages[0]["message_content"] == user_msg_payload["message_content"]
    assert messages[1]["message_content"] == asst_msg_payload["message_content"]
