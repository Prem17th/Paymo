import pytest
from backend.app.services.seed_data import run_seed
from backend.app.models.entities import Case, Transaction, User

def test_seed_idempotency(db_session):
    # Count before second seed run
    cases_count_1 = db_session.query(Case).count()
    txns_count_1 = db_session.query(Transaction).count()
    users_count_1 = db_session.query(User).count()

    # Re-run seed
    run_seed(db_session)

    # Count after second seed run
    cases_count_2 = db_session.query(Case).count()
    txns_count_2 = db_session.query(Transaction).count()
    users_count_2 = db_session.query(User).count()

    assert cases_count_1 == cases_count_2
    assert txns_count_1 == txns_count_2
    assert users_count_1 == users_count_2
