from typing import List, Dict, Any
from sqlalchemy.orm import Session
from backend.app.models.entities import Contact

def list_contacts(db: Session) -> List[Dict[str, Any]]:
    """Lists all contacts from SQLite, sorted by ID."""
    contacts = db.query(Contact).order_by(Contact.id.asc()).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "phone": c.phone,
            "created_at": c.created_at.isoformat() if c.created_at else None
        }
        for c in contacts
    ]

def bulk_create_contacts(db: Session, contact_list: List[Any]) -> List[Dict[str, Any]]:
    """Bulk inserts contacts into SQLite."""
    new_objs = []
    for item in contact_list:
        if isinstance(item, dict):
            name = str(item.get("name") or "").strip()
            phone = str(item.get("phone") or "").strip()
        else:
            name = str(getattr(item, "name", "") or "").strip()
            phone = str(getattr(item, "phone", "") or "").strip()
        if name and phone:
            new_objs.append(Contact(name=name, phone=phone))
    
    if new_objs:
        db.add_all(new_objs)
        db.commit()
    return list_contacts(db)

def clear_all_contacts(db: Session) -> int:
    """Deletes all contacts from SQLite permanently without recreating demo records."""
    count = db.query(Contact).delete()
    db.commit()
    return count
