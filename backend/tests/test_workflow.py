import pytest

def test_complete_e2e_workflow(client):
    conv_id = "conv_e2e_workflow_test"

    # Step 1 & 2: Submit a payment complaint to Assistant
    complaint_payload = {
        "sender_type": "user",
        "message_content": "Order ORD_E2E_7781 failed after UPI debit of Rs 3,450. Please recover.",
        "language": "en"
    }
    res_msg = client.post(f"/api/conversations/{conv_id}/messages", json=complaint_payload)
    assert res_msg.status_code == 201

    # Step 3: Save conversation & assistant response
    asst_payload = {
        "sender_type": "assistant",
        "message_content": "[DEMO ASSISTANT RESPONSE — SIMULATED] Correlated order ORD_E2E_7781 with gateway cf_tx_e2e_7781. UPI debit captured at bank.",
        "language": "en"
    }
    res_asst = client.post(f"/api/conversations/{conv_id}/messages", json=asst_payload)
    assert res_asst.status_code == 201

    # Step 4: Create an incident from the complaint
    case_payload = {
        "order_id": "ORD_E2E_7781",
        "transaction_id": "cf_tx_e2e_7781",
        "customer_name": "Karthik Raja",
        "customer_email": "karthik.raja@example.com",
        "amount": 3450.00,
        "payment_status": "FAILED",
        "order_status": "PENDING_CONFIRMATION",
        "assigned_team": "Support",
        "channel": "UPI",
        "issue_type": "FAILED",
        "description": "Payment debited but order failed (logged from assistant conversation)"
    }
    res_case = client.post("/api/cases", json=case_payload)
    assert res_case.status_code == 201
    created_case = res_case.json()
    new_case_id = created_case["id"]
    assert created_case["order_id"] == "ORD_E2E_7781"

    # Step 5 & 6: Verify incident appears in cases listing
    res_list = client.get(f"/api/cases?search=ORD_E2E_7781")
    assert res_list.status_code == 200
    matched_cases = res_list.json()
    assert len(matched_cases) == 1
    assert matched_cases[0]["id"] == new_case_id

    # Step 7: Assign it to Engineering
    res_assign = client.patch(f"/api/cases/{new_case_id}/assign", json={
        "assigned_team": "Engineering",
        "actor": "Lead Platform Engineer"
    })
    assert res_assign.status_code == 200
    assert res_assign.json()["assigned_team"] == "Engineering"

    # Step 8 & 9: Verify incident and conversation remain saved after independent query
    res_recheck_case = client.get(f"/api/cases/{new_case_id}")
    assert res_recheck_case.status_code == 200
    assert res_recheck_case.json()["assigned_team"] == "Engineering"
    assert any("Engineering" in t["description"] for t in res_recheck_case.json()["timeline"])

    res_recheck_conv = client.get(f"/api/conversations/{conv_id}/messages")
    assert res_recheck_conv.status_code == 200
    msgs = res_recheck_conv.json()
    assert len(msgs) == 2
    assert msgs[0]["message_content"] == complaint_payload["message_content"]

    # Step 10: Verify Overview metrics reflect the new case
    res_overview = client.get("/api/overview/summary")
    assert res_overview.status_code == 200
    overview_data = res_overview.json()
    assert overview_data["total_cases"] >= 6
    # Recent cases contains the new case
    assert any(c["id"] == new_case_id for c in overview_data["recent_cases"])
