import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.app.services import case_service
from backend.app.schemas.pydantic_schemas import CaseCreateRequest, CaseResponse

class PendingActionStore:
    def __init__(self):
        # Keyed by action_id -> dict
        self._actions: Dict[str, Dict[str, Any]] = {}

    def stage_action(
        self,
        conversation_id: str,
        action_type: str,
        payload: Dict[str, Any],
        summary: str
    ) -> Dict[str, Any]:
        action_id = f"act_{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=15)

        action_data = {
            "action_id": action_id,
            "conversation_id": conversation_id,
            "action_type": action_type,
            "payload": payload,
            "summary": summary,
            "status": "PENDING",
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat()
        }

        self._actions[action_id] = action_data
        return action_data

    def get_action(self, action_id: str) -> Optional[Dict[str, Any]]:
        action = self._actions.get(action_id)
        if not action:
            return None

        # Check expiration
        expires_at = datetime.fromisoformat(action["expires_at"])
        if datetime.now(timezone.utc) > expires_at:
            action["status"] = "EXPIRED"

        return action

    def confirm_action(
        self,
        db: Session,
        conversation_id: str,
        action_id: str
    ) -> Dict[str, Any]:
        action = self.get_action(action_id)
        if not action:
            return {
                "success": False,
                "error": f"Action ID '{action_id}' not found."
            }

        if action["conversation_id"] != conversation_id:
            return {
                "success": False,
                "error": "Action does not belong to this conversation."
            }

        if action["status"] == "EXPIRED":
            return {
                "success": False,
                "error": "This pending action has expired (15m window passed). Please request a new action."
            }

        if action["status"] != "PENDING":
            return {
                "success": False,
                "error": f"Action is already in '{action['status']}' state."
            }

        # Execute the staged action
        if action["action_type"] == "create_case":
            payload = action["payload"]
            created = case_service.create_case(
                db,
                CaseCreateRequest(
                    order_id=payload["order_id"],
                    transaction_id=payload["transaction_id"],
                    customer_name=payload["customer_name"],
                    customer_email=payload["customer_email"],
                    amount=float(payload["amount"]),
                    payment_status=payload.get("payment_status", "FAILED"),
                    assigned_team=payload.get("assigned_team", "Engineering"),
                    channel=payload.get("channel", "UPI"),
                    issue_type=payload.get("issue_type", "FAILED"),
                    description=payload.get("description", "Case created via explicit action confirmation.")
                )
            )

            action["status"] = "CONFIRMED"
            action["executed_at"] = datetime.now(timezone.utc).isoformat()
            action["result"] = {"case_id": created.id}

            return {
                "success": True,
                "action_id": action_id,
                "status": "CONFIRMED",
                "case": created,
                "message": f"Server-validated authorization confirmed. Incident {created.id} has been created."
            }

        return {
            "success": False,
            "error": f"Unsupported action type: {action['action_type']}"
        }

    def cancel_action(
        self,
        conversation_id: str,
        action_id: str
    ) -> Dict[str, Any]:
        action = self.get_action(action_id)
        if not action:
            return {
                "success": False,
                "error": f"Action ID '{action_id}' not found."
            }

        if action["conversation_id"] != conversation_id:
            return {
                "success": False,
                "error": "Action does not belong to this conversation."
            }

        if action["status"] != "PENDING":
            return {
                "success": False,
                "error": f"Action is already in '{action['status']}' state."
            }

        action["status"] = "CANCELLED"
        action["cancelled_at"] = datetime.now(timezone.utc).isoformat()

        return {
            "success": True,
            "action_id": action_id,
            "status": "CANCELLED",
            "message": "Action has been cancelled. No database changes were made."
        }

# Singleton instance
action_store = PendingActionStore()
