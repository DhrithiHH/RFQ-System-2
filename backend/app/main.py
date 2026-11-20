import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import auth, bids, rfqs, ws
from app.services.expiry_watcher import run_expiry_watcher


@asynccontextmanager
async def lifespan(_app: FastAPI):
    stop_event = asyncio.Event()
    watcher_task = asyncio.create_task(run_expiry_watcher(stop_event))
    try:
        yield
    finally:
        stop_event.set()
        await watcher_task


app = FastAPI(
    title="GoComet British Auction RFQ System",
    description="Modular monolith FastAPI backend for British Auction-style RFQ bidding.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(rfqs.router)
app.include_router(bids.router)
app.include_router(ws.router)


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
