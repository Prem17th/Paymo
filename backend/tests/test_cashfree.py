import pytest
from unittest.mock import patch, MagicMock

from backend.app.core.config import settings
from backend.app.services import cashfree_service


def test_cashfree_status(client):
    res = cashfree_service.check_cashfree_availability()
    assert "configured" in res
    assert "environment" in res

    resp = client.get("/api/cashfree/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["environment"] == "sandbox"


def test_create_sandbox_order_validation(client):
    # Negative amount
    resp = client.post(
        "/api/payments/create-order",
        json={"amount": -50.0}
    )
    assert resp.status_code == 422 or resp.status_code == 400

    # Zero amount
    resp2 = client.post(
        "/api/payments/create-order",
        json={"amount": 0.0}
    )
    assert resp2.status_code == 422 or resp2.status_code == 400


def test_create_sandbox_order_mocked_success(client, db_session):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "order_id": "order_mock_12345",
        "order_status": "ACTIVE",
        "payment_session_id": "session_mock_12345",
        "cf_order_id": "cf_12345"
    }

    import httpx
    orig_post = httpx.Client.post

    def post_side_effect(self, url, *args, **kwargs):
        if "cashfree.com" in str(url):
            return mock_resp
        return orig_post(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "post", autospec=True, side_effect=post_side_effect):
        res = cashfree_service.create_sandbox_order(
            db_session,
            amount=2499.0,
            description="Test Order",
            customer_name="Test Customer",
            customer_email="cust@test.com"
        )
        assert res["success"] is True
        assert res["amount"] == 2499.0
        assert res["payment_session_id"] == "session_mock_12345"
        assert res["order_status"] == "ACTIVE"

    # Check endpoint with service mock to avoid TestClient transport interference
    with patch("backend.app.api.endpoints.cashfree_service.create_sandbox_order") as mock_create:
        mock_create.return_value = {
            "success": True,
            "order_id": "order_mock_12345",
            "amount": 1500.0,
            "currency": "INR",
            "payment_session_id": "session_mock_12345",
            "cf_order_id": "cf_12345",
            "order_status": "ACTIVE",
            "is_simulated": False
        }
        resp = client.post(
            "/api/payments/create-order",
            json={
                "amount": 1500.0,
                "description": "API Test",
                "customer_name": "API User",
                "customer_email": "api@test.com"
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["amount"] == 1500.0


def test_verify_order_payment_mocked_success(client, db_session):
    # Create an order first
    create_res = cashfree_service.create_sandbox_order(
        db_session,
        amount=500.0,
        description="Verify Test"
    )
    ord_id = create_res["order_id"]

    # Mock Cashfree order and payments endpoints
    order_mock = MagicMock()
    order_mock.status_code = 200
    order_mock.json.return_value = {"order_status": "PAID"}

    payments_mock = MagicMock()
    payments_mock.status_code = 200
    payments_mock.json.return_value = [{
        "payment_status": "SUCCESS",
        "payment_group": "upi",
        "payment_amount": 500.0
    }]

    import httpx
    orig_get = httpx.Client.get

    def get_side_effect(self, url, *args, **kwargs):
        if "cashfree.com" in str(url):
            if f"/orders/{ord_id}/payments" in str(url):
                return payments_mock
            return order_mock
        return orig_get(self, url, *args, **kwargs)

    with patch.object(httpx.Client, "get", autospec=True, side_effect=get_side_effect):
        res = cashfree_service.verify_order_payment(db_session, ord_id)
        assert res["order_id"] == ord_id
        assert res["payment_status"] == "SUCCESS"
        assert res["order_status"] == "COMPLETED"

        # Check endpoint
        resp = client.get(f"/api/payments/verify/{ord_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["order_id"] == ord_id
        assert data["payment_status"] == "SUCCESS"


def test_list_payments_endpoint(client):
    resp = client.get("/api/payments")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "transaction_id" in data[0]
    assert "amount" in data[0]
