import pytest

def test_overview_summary(client):
    response = client.get("/api/overview/summary")
    assert response.status_code == 200
    data = response.json()
    assert "total_cases" in data
    assert "open_cases" in data
    assert "resolved_cases" in data
    assert "recent_cases" in data
    assert data["total_cases"] >= 5

def test_list_cases_and_filter(client):
    # Test all cases
    response = client.get("/api/cases")
    assert response.status_code == 200
    cases = response.json()
    assert len(cases) >= 5

    # Test search by order ID
    response = client.get("/api/cases?search=ORD_9823412")
    assert response.status_code == 200
    results = response.json()
    assert len(results) >= 1
    assert results[0]["order_id"] == "ORD_9823412"

    # Test filter by status
    response = client.get("/api/cases?status=OPEN")
    assert response.status_code == 200
    results = response.json()
    for c in results:
        assert c["investigation_status"] == "OPEN"

    # Test filter by team
    response = client.get("/api/cases?team=Engineering")
    assert response.status_code == 200
    results = response.json()
    for c in results:
        assert c["assigned_team"] == "Engineering"

def test_create_case_success(client):
    payload = {
        "order_id": "ORD_TEST_9999",
        "transaction_id": "cf_tx_test_9999",
        "customer_name": "Test Customer",
        "customer_email": "test@example.com",
        "customer_phone": "+91 99999 88888",
        "amount": 3499.50,
        "currency": "INR",
        "payment_status": "FAILED",
        "order_status": "PENDING_CONFIRMATION",
        "assigned_team": "Support",
        "channel": "UPI",
        "issue_type": "FAILED",
        "description": "Test incident creation via pytest"
    }
    response = client.post("/api/cases", json=payload)
    assert response.status_code == 201
    case = response.json()
    assert case["order_id"] == "ORD_TEST_9999"
    assert case["amount"] == 3499.50
    assert case["assigned_team"] == "Support"
    assert case["investigation_status"] == "OPEN"
    assert len(case["timeline"]) >= 1

    # Verify retrieval
    get_res = client.get(f"/api/cases/{case['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == case["id"]

def test_create_case_invalid_input(client):
    # Missing required order_id & invalid email
    payload = {
        "transaction_id": "cf_tx_invalid",
        "customer_name": "Bad Payload",
        "customer_email": "not-an-email",
        "amount": -100.0
    }
    response = client.post("/api/cases", json=payload)
    assert response.status_code == 422

def test_update_case_status(client):
    # Fetch existing case
    cases_res = client.get("/api/cases")
    case_id = cases_res.json()[0]["id"]

    update_payload = {
        "status": "RESOLVED",
        "reason": "Reconciled with bank gateway poller",
        "actor": "Lead Engineer"
    }
    response = client.patch(f"/api/cases/{case_id}/status", json=update_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["investigation_status"] == "RESOLVED"

    # Verify timeline updated
    timeline_res = client.get(f"/api/cases/{case_id}/timeline")
    assert timeline_res.status_code == 200
    timeline = timeline_res.json()
    assert any("RESOLVED" in t["description"] for t in timeline)

def test_assign_case(client):
    cases_res = client.get("/api/cases")
    case_id = cases_res.json()[0]["id"]

    assign_payload = {
        "assigned_team": "Finance",
        "actor": "Lead Platform Engineer"
    }
    response = client.patch(f"/api/cases/{case_id}/assign", json=assign_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["assigned_team"] == "Finance"
