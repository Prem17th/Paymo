import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.app.models.entities import Message
from backend.app.schemas.pydantic_schemas import MessageResponse, ConversationResponse

def get_conversation_messages(db: Session, conversation_id: str) -> List[MessageResponse]:
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return [
        MessageResponse(
            message_id=m.message_id,
            conversation_id=m.conversation_id,
            case_id=m.case_id,
            sender_type=m.sender_type,
            message_content=m.message_content,
            language=m.language,
            audio_available=m.audio_available,
            metadata_json=m.metadata_json,
            created_at=m.created_at
        )
        for m in messages
    ]

def add_message(
    db: Session,
    conversation_id: str,
    sender_type: str,
    message_content: str,
    language: str = "en",
    case_id: Optional[str] = None,
    metadata_json: Optional[str] = None,
    audio_available: bool = False
) -> MessageResponse:
    msg_id = f"msg_{uuid.uuid4().hex[:12]}"
    new_msg = Message(
        message_id=msg_id,
        conversation_id=conversation_id,
        case_id=case_id,
        sender_type=sender_type,
        message_content=message_content,
        language=language,
        audio_available=audio_available,
        metadata_json=metadata_json,
        created_at=datetime.now(timezone.utc)
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    return MessageResponse(
        message_id=new_msg.message_id,
        conversation_id=new_msg.conversation_id,
        case_id=new_msg.case_id,
        sender_type=new_msg.sender_type,
        message_content=new_msg.message_content,
        language=new_msg.language,
        audio_available=new_msg.audio_available,
        metadata_json=new_msg.metadata_json,
        created_at=new_msg.created_at
    )
