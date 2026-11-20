from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user, require_buyer
from app.models.user import User
from app.schemas.auction import ActivityLogResponse, AuctionStateResponse
from app.schemas.rfq import (
    InviteSuppliersRequest,
    RFQCreate,
    RFQDetailResponse,
    RFQSummaryResponse,
)
from app.services.activity_service import ActivityService
from app.services.auction_engine import AuctionEngine
from app.services.rfq_service import RFQService

router = APIRouter(prefix="/api/rfqs", tags=["RFQs & Auctions"])


@router.post("/", response_model=RFQDetailResponse, status_code=status.HTTP_201_CREATED)
def create_rfq(
    payload: RFQCreate,
    buyer: User = Depends(require_buyer),
    db: Session = Depends(get_db),
) -> RFQDetailResponse:
    return RFQService.create_rfq(db, buyer, payload)


@router.get("/", response_model=list[RFQSummaryResponse])
def list_rfqs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RFQSummaryResponse]:
    return RFQService.list_rfqs(db, current_user)


@router.get("/{rfq_id}", response_model=RFQDetailResponse)
def get_rfq(
    rfq_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RFQDetailResponse:
    return RFQService.get_rfq_detail(db, rfq_id, current_user)


@router.post("/{rfq_id}/suppliers", response_model=RFQDetailResponse)
def invite_suppliers(
    rfq_id: UUID,
    payload: InviteSuppliersRequest,
    buyer: User = Depends(require_buyer),
    db: Session = Depends(get_db),
) -> RFQDetailResponse:
    return RFQService.invite_suppliers(db, rfq_id, buyer, payload.supplier_ids)


@router.get("/{rfq_id}/auction", response_model=AuctionStateResponse)
def get_auction_state(
    rfq_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuctionStateResponse:
    return RFQService.get_auction_state(db, rfq_id, current_user)


@router.get("/{rfq_id}/activity", response_model=list[ActivityLogResponse])
def get_auction_activity(
    rfq_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ActivityLogResponse]:
    RFQService.verify_rfq_access(db, rfq_id, current_user)
    alias_map = AuctionEngine.build_supplier_alias_map(db, rfq_id)
    return ActivityService.list_activity_logs(db, rfq_id, current_user.role, current_user.id, alias_map)
