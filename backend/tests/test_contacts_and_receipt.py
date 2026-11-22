import pytest
from unittest.mock import patch, MagicMock

def test_contact_directory_lifecycle(client):
    # 1. Contact directory should be empty initially
    res = client.get("/api/contacts")
    assert res.status_code == 200
    assert res.json() == []

    # 2. Bulk import contacts
    payload = {
        "contacts": [
            {"name": "Priya Sharma", "phone": "9876543210"},
            {"name": "Rohan Patel", "phone": "9123456789"}
        ]
    }
    create_res = client.post("/api/contacts/bulk", json=payload)
    assert create_res.status_code == 200
    data = create_res.json()
    assert len(data) == 2
    assert data[0]["name"] == "Priya Sharma"
    assert data[1]["phone"] == "9123456789"

    # 3. Persistent retrieval
    get_res = client.get("/api/contacts")
    assert get_res.status_code == 200
    assert len(get_res.json()) == 2

    # 4. Clear contacts permanently
    del_res = client.delete("/api/contacts")
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["success"] is True
    assert del_data["deleted"] == 2

    # 5. Must remain 0 contacts, never re-seeded
    empty_res = client.get("/api/contacts")
    assert empty_res.status_code == 200
    assert empty_res.json() == []
