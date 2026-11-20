from dataclasses import dataclass
from typing import Any
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)
_jwks_client: PyJWKClient | None = None


@dataclass
class VerifiedToken:
    user_id: UUID
    email: str | None
    raw_claims: dict[str, Any]


def _get_jwks_client() -> PyJWKClient | None:
    global _jwks_client
    if not settings.supabase_url:
        return None
    if _jwks_client is None:
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client


def verify_supabase_token(token: str) -> VerifiedToken:
    """Verify a Supabase-issued JWT via JWKS (asymmetric) or HS256 JWT secret."""
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        if alg.startswith("HS"):
            if not settings.supabase_jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="SUPABASE_JWT_SECRET is not configured on the server.",
                )
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=settings.supabase_jwt_audience,
            )
        else:
            client = _get_jwks_client()
            if client is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="SUPABASE_URL is not configured for JWKS verification.",
                )
            signing_key = client.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                audience=settings.supabase_jwt_audience,
            )
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token.") from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject claim.")

    try:
        user_id = UUID(str(sub))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token subject is not a valid UUID.") from exc

    return VerifiedToken(user_id=user_id, email=claims.get("email"), raw_claims=claims)


def get_verified_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> VerifiedToken:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer token.",
        )
    return verify_supabase_token(credentials.credentials)


def get_current_user(
    token: VerifiedToken = Depends(get_verified_token),
    db: Session = Depends(get_db),
) -> User:
    """Resolve authenticated user profile and authoritative role from PostgreSQL."""
    user = db.get(User, token.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application user profile not found. Complete profile registration first.",
        )
    return user


def require_buyer(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.BUYER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Buyer role required for this action.",
        )
    return current_user


def require_supplier(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.SUPPLIER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supplier role required for this action.",
        )
    return current_user
