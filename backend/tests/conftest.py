import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.user import User, UserRole

TEST_JWT_SECRET = "test-super-secret-supabase-jwt-key-32bytes"


@pytest.fixture(autouse=True)
def configure_test_jwt_secret(monkeypatch):
    monkeypatch.setattr(settings, "supabase_jwt_secret", TEST_JWT_SECRET)
    monkeypatch.setattr(settings, "supabase_jwt_audience", "authenticated")


@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session_factory(db_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=db_engine)


@pytest.fixture()
def db(db_session_factory) -> Session:
    session = db_session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session_factory):
    def override_get_db():
        session = db_session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def make_auth_headers(user: User) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(user.id),
            "email": user.email,
            "aud": "authenticated",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=1)).timestamp()),
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def seed_users(db: Session) -> dict[str, User]:
    buyer = User(id=uuid.uuid4(), name="Acme Buyer", email="buyer@acme.com", role=UserRole.BUYER.value)
    sup_a = User(id=uuid.uuid4(), name="Maersk Partner", email="a@maersk.com", role=UserRole.SUPPLIER.value)
    sup_b = User(id=uuid.uuid4(), name="MSC Freight", email="b@msc.com", role=UserRole.SUPPLIER.value)
    sup_c = User(id=uuid.uuid4(), name="Hapag Express", email="c@hapag.com", role=UserRole.SUPPLIER.value)
    outsider = User(id=uuid.uuid4(), name="Uninvited Logistics", email="out@other.com", role=UserRole.SUPPLIER.value)

    db.add_all([buyer, sup_a, sup_b, sup_c, outsider])
    db.commit()
    return {
        "buyer": buyer,
        "sup_a": sup_a,
        "sup_b": sup_b,
        "sup_c": sup_c,
        "outsider": outsider,
    }
