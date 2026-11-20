from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import VerifiedToken, get_current_user, get_verified_token, require_buyer
from app.models.user import User, UserRole
from app.schemas.auth import ProfileBootstrapRequest, SupplierDirectoryItem, UserProfileResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    """Return the authenticated user's profile and authoritative backend role."""
    return current_user


@router.get("/profile", response_model=UserProfileResponse)
def get_profile(current_user: User = Depends(get_current_user)) -> User:
    """Return application profile details for the authenticated user."""
    return current_user


@router.post("/register-profile", response_model=UserProfileResponse, status_code=status.HTTP_201_CREATED)
def register_profile(
    payload: ProfileBootstrapRequest,
    token: VerifiedToken = Depends(get_verified_token),
    db: Session = Depends(get_db),
) -> User:
    """One-time application profile creation immediately after Supabase Auth signup.

    Once created, `users.role` is immutable from the client side.
    """
    existing = db.get(User, token.user_id)
    if existing is not None:
        return existing

    email = token.email or token.raw_claims.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supabase token does not include an email address.",
        )

    user = User(
        id=token.user_id,
        name=payload.name.strip(),
        email=email.lower(),
        role=payload.role.value,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/suppliers", response_model=list[SupplierDirectoryItem])
def list_registered_suppliers(
    _buyer: User = Depends(require_buyer),
    db: Session = Depends(get_db),
) -> list[User]:
    """Return registered suppliers so buyers can invite them when creating an RFQ."""
    return list(
        db.scalars(
            select(User).where(User.role == UserRole.SUPPLIER.value).order_by(User.name.asc())
        ).all()
    )
