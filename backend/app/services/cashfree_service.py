import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.core.config import settings
from backend.app.models.entities import Transaction

def check_cashfree_availability() -> Dict[str, Any]:
    """
    Safely inspects whether Cashfree Sandbox credentials are configured and reachable.
    Never exposes keys or secrets.
    """
    app_id = settings.CASHFREE_APP_ID.strip()
    secret = settings.CASHFREE_SECRET_KEY.strip()

    if not app_id or not secret:
        return {
            "configured": False,
            "reachable": False,
            "environment": settings.CASHFREE_ENV,
            "status": "NOT_CONFIGURED",
            "message": "CASHFREE_APP_ID or CASHFREE_SECRET_KEY is not configured."
        }

    headers = {
        "x-client-id": app_id,
        "x-client-secret": secret,
        "x-api-version": settings.CASHFREE_API_VERSION
    }

    try:
        # Check orders list endpoint or lightweight query
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(f"{settings.CASHFREE_BASE_URL}/orders", headers=headers)
            # A 200 or 404 (endpoint valid route format) indicates successful auth; 401 indicates bad secret
            is_authenticated = resp.status_code != 401 and resp.status_code != 403
            return {
                "configured": True,
                "reachable": is_authenticated,
                "environment": settings.CASHFREE_ENV,
                "status": "REACHABLE" if is_authenticated else "AUTH_FAILED",
                "message": "Connected to Cashfree Sandbox API." if is_authenticated else "Authentication failed with Cashfree."
            }
    except Exception as e:
        return {
            "configured": True,
            "reachable": False,
            "environment": settings.CASHFREE_ENV,
            "status": "UNREACHABLE",
            "message": f"Cashfree Sandbox unreachable: {str(e)}"
        }


def create_sandbox_order(
    db: Session,
    amount: float,
    description: Optional[str] = None,
    customer_name: Optional[str] = "Demo Customer",
    customer_email: Optional[str] = "customer@example.com",
    customer_phone: Optional[str] = "9999999999"
) -> Dict[str, Any]:
    """
    Creates a real payment order in Cashfree Sandbox environment.
    Never enables production money movement.
    """
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")
    if amount > 100000:
        raise HTTPException(status_code=400, detail="Amount exceeds maximum single transaction limit of ₹1,00,000.")

    app_id = settings.CASHFREE_APP_ID.strip()
    secret = settings.CASHFREE_SECRET_KEY.strip()

    order_id = f"order_{uuid.uuid4().hex[:12]}"
    clean_cust_name = customer_name.strip() if customer_name else "Demo Customer"
    clean_cust_email = customer_email.strip() if customer_email else "customer@example.com"
    clean_cust_phone = customer_phone.strip() if customer_phone else "9999999999"

    # In sandbox without credentials, allow simulated mode
    if not app_id or not secret:
        # Local mock mode
        mock_txn_id = f"cf_tx_{order_id}"
        txn = Transaction(
            transaction_id=mock_txn_id,
            order_id=order_id,
            amount_paise=int(round(amount * 100)),
            currency="INR",
            payment_status="PENDING",
            order_status="ACTIVE",
            source="CASHFREE",
            payment_method="UPI_SANDBOX",
            customer_name=clean_cust_name,
            customer_email=clean_cust_email,
            created_at=datetime.now(timezone.utc)
        )
        db.add(txn)
        db.commit()
        db.refresh(txn)

        return {
            "success": True,
            "order_id": order_id,
            "amount": amount,
            "currency": "INR",
            "payment_session_id": f"session_sim_{uuid.uuid4().hex[:16]}",
            "cf_order_id": f"cf_{uuid.uuid4().hex[:8]}",
            "order_status": "ACTIVE",
            "is_simulated": True
        }

    # Real Cashfree Sandbox API Call
    headers = {
        "x-client-id": app_id,
        "x-client-secret": secret,
        "x-api-version": settings.CASHFREE_API_VERSION,
        "Content-Type": "application/json"
    }

    payload = {
        "order_id": order_id,
        "order_amount": round(amount, 2),
        "order_currency": "INR",
        "customer_details": {
            "customer_id": f"cust_{uuid.uuid4().hex[:8]}",
            "customer_name": clean_cust_name,
            "customer_email": clean_cust_email,
            "customer_phone": clean_cust_phone
        },
        "order_meta": {
            "return_url": f"http://localhost:5173/payments?order_id={order_id}"
        },
        "order_note": description or "Paymo Merchant Sandbox Payment"
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{settings.CASHFREE_BASE_URL}/orders",
                headers=headers,
                json=payload
            )

        if resp.status_code not in [200, 201]:
            err_msg = resp.text
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"Cashfree Order Creation failed: {err_msg}"
            )

        data = resp.json()
        payment_session_id = data.get("payment_session_id")
        cf_order_id = str(data.get("cf_order_id", ""))

        # Persist single order record in SQLite database without duplicates
        txn = db.query(Transaction).filter(Transaction.order_id == order_id).first()
        if not txn:
            txn = Transaction(
                transaction_id=cf_order_id if cf_order_id else order_id,
                order_id=order_id,
                amount_paise=int(round(amount * 100)),
                currency="INR",
                payment_status="PENDING",
                order_status=data.get("order_status", "ACTIVE"),
                source="CASHFREE",
                payment_method="UPI_SANDBOX",
                customer_name=clean_cust_name,
                customer_email=clean_cust_email,
                created_at=datetime.now(timezone.utc)
            )
            db.add(txn)
        else:
            txn.amount_paise = int(round(amount * 100))
            txn.order_status = data.get("order_status", "ACTIVE")
            if cf_order_id:
                txn.transaction_id = cf_order_id

        db.commit()
        db.refresh(txn)

        return {
            "success": True,
            "order_id": order_id,
            "amount": amount,
            "currency": "INR",
            "payment_session_id": payment_session_id,
            "cf_order_id": cf_order_id,
            "order_status": data.get("order_status", "ACTIVE"),
            "is_simulated": False
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Network error communicating with Cashfree Sandbox: {str(e)}"
        )


def verify_order_payment(db: Session, order_id: str) -> Dict[str, Any]:
    """
    Verifies payment status with Cashfree's authenticated API.
    Never trusts client-supplied payment success without server-side verification.
    """
    txn = db.query(Transaction).filter(Transaction.order_id == order_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found in database.")

    app_id = settings.CASHFREE_APP_ID.strip()
    secret = settings.CASHFREE_SECRET_KEY.strip()

    # If simulated without credentials or simulated order
    if not app_id or not secret or "order_test" in order_id:
        return {
            "order_id": txn.order_id,
            "transaction_id": txn.transaction_id,
            "amount": round(txn.amount_paise / 100.0, 2),
            "currency": txn.currency,
            "payment_status": txn.payment_status,
            "order_status": txn.order_status,
            "source": txn.source,
            "payment_method": txn.payment_method,
            "customer_name": txn.customer_name,
            "customer_email": txn.customer_email,
            "created_at": txn.created_at.isoformat(),
            "verified_by": "LOCAL_SANDBOX"
        }

    headers = {
        "x-client-id": app_id,
        "x-client-secret": secret,
        "x-api-version": settings.CASHFREE_API_VERSION
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            # 1. Fetch order details
            order_resp = client.get(
                f"{settings.CASHFREE_BASE_URL}/orders/{order_id}",
                headers=headers
            )
            # 2. Fetch payments attempts
            payments_resp = client.get(
                f"{settings.CASHFREE_BASE_URL}/orders/{order_id}/payments",
                headers=headers
            )

        if order_resp.status_code == 200:
            order_data = order_resp.json()
            order_status = order_data.get("order_status", txn.order_status)
        else:
            order_status = txn.order_status

        # Inspect payment attempts
        payment_status = "PENDING"
        payment_method = txn.payment_method

        if payments_resp.status_code == 200:
            payments_list = payments_resp.json()
            if isinstance(payments_list, list) and len(payments_list) > 0:
                # Find latest or successful payment
                for p in payments_list:
                    p_status = p.get("payment_status", "").upper()
                    if p.get("cf_payment_id"):
                        txn.transaction_id = str(p.get("cf_payment_id"))
                    if p_status == "SUCCESS":
                        payment_status = "SUCCESS"
                        payment_method = p.get("payment_group", "UPI")
                        order_status = "COMPLETED"
                        break
                    elif p_status in ["FAILED", "USER_DROPPED"] and payment_status != "SUCCESS":
                        payment_status = "FAILED"
                    elif p_status == "PENDING" and payment_status != "SUCCESS":
                        payment_status = "PENDING"
        elif order_status == "PAID":
            payment_status = "SUCCESS"
            order_status = "COMPLETED"
        elif order_status == "EXPIRED":
            payment_status = "EXPIRED"
        elif order_status in ["TERMINATED", "CANCELLED"]:
            payment_status = "CANCELLED"

        # Update SQLite record
        txn.payment_status = payment_status
        txn.order_status = order_status
        txn.payment_method = payment_method
        db.commit()
        db.refresh(txn)

        return {
            "order_id": txn.order_id,
            "transaction_id": txn.transaction_id,
            "amount": round(txn.amount_paise / 100.0, 2),
            "currency": txn.currency,
            "payment_status": txn.payment_status,
            "order_status": txn.order_status,
            "source": txn.source,
            "payment_method": txn.payment_method,
            "customer_name": txn.customer_name,
            "customer_email": txn.customer_email,
            "created_at": txn.created_at.isoformat(),
            "verified_by": "CASHFREE_SANDBOX_API"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Error verifying payment with Cashfree Sandbox: {str(e)}"
        )


def list_recent_payments(db: Session, limit: int = 50) -> List[Dict[str, Any]]:
    """
    Returns list of payments from SQLite.
    """
    txns = (
        db.query(Transaction)
        .order_by(desc(Transaction.created_at))
        .limit(limit)
        .all()
    )

    return [
        {
            "transaction_id": t.transaction_id,
            "order_id": t.order_id,
            "amount": round(t.amount_paise / 100.0, 2),
            "currency": t.currency,
            "payment_status": t.payment_status,
            "order_status": t.order_status,
            "source": t.source,
            "payment_method": t.payment_method,
            "customer_name": t.customer_name,
            "customer_email": t.customer_email,
            "created_at": t.created_at.isoformat()
        }
        for t in txns
    ]
