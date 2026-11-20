from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Callable
from uuid import UUID

from fastapi import WebSocket


@dataclass(frozen=True)
class AuctionSocketClient:
    websocket: WebSocket
    user_id: UUID
    role: str


class AuctionWebSocketManager:
    """Single-instance in-memory room manager for live auction updates.

    Note for horizontal scaling:
        When running multiple FastAPI replicas, publish post-commit events to
        Redis Pub/Sub (channel `auction:{rfq_id}`) and subscribe each instance
        to fan out messages to its local socket connections.
    """

    def __init__(self) -> None:
        self._rooms: dict[UUID, set[AuctionSocketClient]] = defaultdict(set)

    async def connect(self, rfq_id: UUID, websocket: WebSocket, user_id: UUID, role: str) -> AuctionSocketClient:
        await websocket.accept()
        client = AuctionSocketClient(websocket=websocket, user_id=user_id, role=role)
        self._rooms[rfq_id].add(client)
        return client

    def disconnect(self, rfq_id: UUID, client: AuctionSocketClient) -> None:
        room = self._rooms.get(rfq_id)
        if not room:
            return
        room.discard(client)
        if not room:
            self._rooms.pop(rfq_id, None)

    async def broadcast_event(
        self,
        rfq_id: UUID,
        event_type: str,
        payload_builder: Callable[[AuctionSocketClient], dict[str, Any]],
    ) -> None:
        """Send a role-filtered event to every active socket in an RFQ room."""
        clients = list(self._rooms.get(rfq_id, ()))
        stale: list[AuctionSocketClient] = []
        for client in clients:
            try:
                message = {
                    "type": event_type,
                    "rfq_id": str(rfq_id),
                    "data": payload_builder(client),
                }
                await client.websocket.send_json(message)
            except Exception:
                stale.append(client)

        for client in stale:
            self.disconnect(rfq_id, client)


ws_manager = AuctionWebSocketManager()
