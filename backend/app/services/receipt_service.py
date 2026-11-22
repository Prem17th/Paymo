import io
import json
import base64
from typing import Dict, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_
import httpx
from pypdf import PdfReader

from backend.app.core.config import settings
from backend.app.models.entities import Transaction

def extract_receipt_data(file_bytes: bytes, filename: str, content_type: str, db: Session, language: str = "en-IN") -> Dict[str, Any]:
    """
    Extracts payment information from receipt image or PDF using OpenAI gpt-4o-mini.
    Correlates extracted details against SQLite Transaction database to verify gateway existence.
    Never marks a receipt verified unless a matching successful record exists in the database.
    """
    api_key = settings.OPENAI_API_KEY.strip()
    if not api_key:
        return {
            "amount": None,
            "currency": "INR",
            "date": None,
            "transaction_reference": None,
            "merchant_name": None,
            "payment_method": None,
            "payment_status": None,
            "summary": "OpenAI API key not configured. Cannot process receipt document.",
            "is_verified": False,
            "verification_label": "Unverified receipt (API unconfigured)",
            "matched_transaction": None
        }

    is_pdf = filename.lower().endswith(".pdf") or "pdf" in content_type.lower()
    extracted_text_from_pdf = ""

    if is_pdf:
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            for page in reader.pages:
                extracted_text_from_pdf += (page.extract_text() or "") + "\n"
        except Exception as e:
            extracted_text_from_pdf = f"Failed to parse PDF text: {str(e)}"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    lang_lower = (language or "en-IN").lower()
    if "kn" in lang_lower or "kannada" in lang_lower:
        lang_prompt = "Write the summary explanation in natural, conversational Kannada (ಕನ್ನಡ)."
    elif "hi" in lang_lower or "hindi" in lang_lower:
        lang_prompt = "Write the summary explanation in natural, conversational Hindi (हिन्दी)."
    else:
        lang_prompt = "Write the summary explanation in simple, natural, conversational English."

    system_instruction = (
        "You are an expert financial receipt auditor. Carefully inspect and extract payment data from the document.\n"
        f"{lang_prompt}\n"
        "Return ONLY a valid JSON object with EXACTLY these keys:\n"
        "{\n"
        '  "amount": float or null,\n'
        '  "currency": string or "INR",\n'
        '  "date": string (YYYY-MM-DD or date/time as written) or null,\n'
        '  "transaction_reference": string (UPI ref ID, UTR, Order ID, or Transaction ID) or null,\n'
        '  "merchant_name": string or null,\n'
        '  "payment_method": string (UPI, Netbanking, Credit Card, Debit Card, Wallet) or null,\n'
        '  "payment_status": string ("SUCCESS", "FAILED", "PENDING") or null,\n'
        '  "summary": string (concise plain-language summary suitable for audio speech synthesis)\n'
        "}\n"
        "STRICT FINANCIAL SAFETY RULES:\n"
        "- Do not hallucinate or invent missing details; use null if not visible.\n"
        "- Never initiate or promise any transfer, payment, or refund from receipt contents.\n"
        "- Note that receipt text stating SUCCESS is merely an unverified visual claim until matched with an authorized gateway transaction."
    )

    try:
        if is_pdf and extracted_text_from_pdf.strip():
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": f"Extract receipt details from this text:\n\n{extracted_text_from_pdf[:4000]}"}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }
        else:
            # Image Vision input
            mime = "image/png"
            if filename.lower().endswith(".jpg") or filename.lower().endswith(".jpeg"):
                mime = "image/jpeg"
            elif filename.lower().endswith(".webp"):
                mime = "image/webp"

            b64_img = base64.b64encode(file_bytes).decode("utf-8")
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract all payment details from this receipt image:"},
                            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64_img}"}}
                        ]
                    }
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }

        with httpx.Client(timeout=15.0) as client:
            resp = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)

        if resp.status_code != 200:
            return {
                "amount": None,
                "currency": "INR",
                "date": None,
                "transaction_reference": None,
                "merchant_name": None,
                "payment_status": None,
                "summary": f"OpenAI vision processing returned HTTP {resp.status_code}",
                "is_verified": False,
                "verification_label": "Unverified receipt",
                "matched_transaction": None
            }

        data = resp.json()
        parsed_str = data["choices"][0]["message"]["content"]
        extracted = json.loads(parsed_str)

        amount = extracted.get("amount")
        if amount is not None:
            try:
                amount = float(amount)
            except Exception:
                amount = None

        currency = extracted.get("currency") or "INR"
        date_val = extracted.get("date")
        tx_ref = str(extracted.get("transaction_reference") or "").strip() or None
        merchant = extracted.get("merchant_name")
        p_method = extracted.get("payment_method")
        p_status = extracted.get("payment_status")
        summary = extracted.get("summary") or f"Receipt for {currency} {amount if amount else 'N/A'}"

        # Match against authorized SQLite transaction database
        matched_txn = None
        is_verified = False
        verification_label = "Unverified receipt"

        if tx_ref:
            matched_txn = (
                db.query(Transaction)
                .filter(or_(
                    Transaction.transaction_id == tx_ref,
                    Transaction.order_id == tx_ref,
                    Transaction.transaction_id.ilike(f"%{tx_ref}%"),
                    Transaction.order_id.ilike(f"%{tx_ref}%")
                ))
                .first()
            )

        # Fallback match by exact amount if single recent transaction matches
        if not matched_txn and amount:
            paise = int(round(amount * 100))
            matched_txn = (
                db.query(Transaction)
                .filter(Transaction.amount_paise == paise)
                .order_by(Transaction.created_at.desc())
                .first()
            )

        if matched_txn:
            if matched_txn.payment_status.upper() == "SUCCESS":
                is_verified = True
                verification_label = f"Verified Gateway Record ({matched_txn.order_id})"
            else:
                is_verified = False
                verification_label = f"Gateway Record Found: {matched_txn.payment_status} ({matched_txn.order_id})"
            
            matched_dict = {
                "transaction_id": matched_txn.transaction_id,
                "order_id": matched_txn.order_id,
                "amount": round(matched_txn.amount_paise / 100.0, 2),
                "currency": matched_txn.currency,
                "payment_status": matched_txn.payment_status,
                "order_status": matched_txn.order_status,
                "source": matched_txn.source,
                "payment_method": matched_txn.payment_method,
                "created_at": matched_txn.created_at.isoformat()
            }
        else:
            is_verified = False
            verification_label = "Unverified receipt (No matching gateway transaction found in Paymo)"
            matched_dict = None

        return {
            "amount": amount,
            "currency": currency,
            "date": date_val,
            "transaction_reference": tx_ref,
            "merchant_name": merchant,
            "payment_method": p_method,
            "payment_status": p_status,
            "summary": summary,
            "is_verified": is_verified,
            "verification_label": verification_label,
            "matched_transaction": matched_dict
        }

    except Exception as e:
        return {
            "amount": None,
            "currency": "INR",
            "date": None,
            "transaction_reference": None,
            "merchant_name": None,
            "payment_method": None,
            "payment_status": None,
            "summary": f"Extraction error: {str(e)}",
            "is_verified": False,
            "verification_label": "Unverified receipt",
            "matched_transaction": None
        }
