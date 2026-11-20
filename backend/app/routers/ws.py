from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from app.database import SessionLocal
from app.dependencies.auth import verify_supabase_token
from app.models.user import User
from app.services.rfq_service import RFQService
from app.websocket.manager import ws_manager

router = APIRouter(tags=["WebSockets"])


@router.websocket("/ws/auctions/{rfq_id}")
async def auction_websocket(
    websocket: WebSocket,
    rfq_id: UUID,
    token: str = Query(..., description="Supabase access JWT"),
) -> None:
    try:
        verified = verify_supabase_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return

    with SessionLocal() as db:
        user = db.get(User, verified.user_id)
        if user is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User profile not found")
            return
        try:
            RFQService.verify_rfq_access(db, rfq_id, user)
        except Exception:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Forbidden")
            return
        user_id = user.id
        user_role = user.role

    client = await ws_manager.connect(rfq_id, websocket, user_id, user_role)
    try:
        while True:
            # Keep connection open and handle optional client ping messages
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "PONG"})
    except WebSocketDisconnect:
        ws_manager.disconnect(rfq_id, client)
    except Exception:
        ws_manager.disconnect(rfq_id, client)
