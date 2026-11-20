from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user, require_supplier
from app.models.user import User
from app.schemas.bid import BidCreate, BidResponse, BidSubmissionResultResponse, RankingEntryResponse
from app.services.bid_service import BidService

router = APIRouter(prefix="/api/rfqs", tags=["Bids & Rankings"])


@router.post("/{rfq_id}/bids", response_model=BidSubmissionResultResponse, status_code=status.HTTP_201_CREATED)
async def submit_bid(
    rfq_id: UUID,
    payload: BidCreate,
    supplier: User = Depends(require_supplier),
    db: Session = Depends(get_db),
) -> BidSubmissionResultResponse:
    return await BidService.submit_bid(db, rfq_id, supplier, payload)


@router.get("/{rfq_id}/bids", response_model=list[BidResponse])
def list_bids(
    rfq_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BidResponse]:
    return BidService.list_bids(db, rfq_id, current_user)


@router.get("/{rfq_id}/ranking", response_model=list[RankingEntryResponse])
def get_ranking(
    rfq_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RankingEntryResponse]:
    return BidService.get_rankings(db, rfq_id, current_user)
