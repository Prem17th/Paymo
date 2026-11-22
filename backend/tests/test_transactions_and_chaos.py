import pytest

def test_transaction_lookup(client):
    # Lookup by Order ID
    res1 = client.get("/api/transactions/ORD_9823412")
    assert res1.status_code == 200
    txn1 = res1.json()
    assert txn1["order_id"] == "ORD_9823412"
    assert txn1["payment_status"] == "FAILED"

    # Lookup by Transaction ID
    res2 = client.get("/api/transactions/cf_tx_90812938")
    assert res2.status_code == 200
    txn2 = res2.json()
    assert txn2["transaction_id"] == "cf_tx_90812938"

    # Lookup non-existent
    res3 = client.get("/api/transactions/NON_EXISTENT_ID")
    assert res3.status_code == 404

def test_webhooks_history(client):
    res = client.get("/api/webhooks")
    assert res.status_code == 200
    webhooks = res.json()
    assert len(webhooks) >= 3

    # By transaction ID
    res2 = client.get("/api/webhooks/by-transaction/cf_tx_90812938")
    assert res2.status_code == 200
    wh_list = res2.json()
    assert len(wh_list) >= 1
    assert wh_list[0]["transaction_id"] == "cf_tx_90812938"

def test_chaos_test_run(client):
    payload = {
        "scenario_id": "delayed_webhook",
        "case_id": "CASE-2024-8831",
        "order_id": "ORD_9823412"
    }
    res = client.post("/api/chaos/run", json=payload)
    assert res.status_code == 201
    run = res.json()
    assert run["scenario"] == "Delayed Webhook (120s lag)"
    assert "SIMULATED" in run["status"]

    # Verify history
    hist_res = client.get("/api/chaos/history")
    assert hist_res.status_code == 200
    history = hist_res.json()
    assert len(history) >= 1
