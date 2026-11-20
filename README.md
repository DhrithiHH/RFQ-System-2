# GoComet British Auction RFQ System

A modular-monolith RFQ (Request for Quotation) platform implementing **British Auction–style anti-sniping bidding**, automatic configurable deadline extensions, strict forced-closure caps, real-time WebSocket updates, role-based access control, and full audit trails.

---

## Deliverables Included

| Deliverable | Path | Description |
|---|---|---|
| **1. High-Level Design** | [`docs/HLD.md`](./docs/HLD.md) | System architecture, Mermaid diagrams, Supabase Auth flow, extension workflow, concurrency model, and scaling trade-offs. |
| **2. Database Schema Design** | [`docs/database-schema.md`](./docs/database-schema.md) | Mermaid ER diagram, 6 PostgreSQL table specifications, constraints, composite indexes, and transaction boundaries. |
| **3. Backend Code** | [`backend/`](./backend/) | Production-structured **Python + FastAPI + SQLAlchemy 2.0 + Alembic + Supabase JWT Auth + WebSockets + Pytest** (17 tests). |
| **4. Frontend Code** | [`frontend/`](./frontend/) | Standalone **React + Vite + React Router + Supabase JS Client** application with Buyer & Supplier dashboards. |
| **Live Interactive Preview** | Root (`server.ts`, `src/`) | Full-stack live preview with Express + WebSockets implementing the exact same REST & WS contract for instant interactive testing. |

---

## Architecture Highlights

- **Modular Monolith:** Clean separation across `routers/`, `schemas/`, `services/`, `services/auction_engine.py`, `models/`, `dependencies/`, and `websocket/`. Zero business logic inside API route handlers.
- **Anti-Sniping Extension Formula:**
  $$\text{NewCloseTime} = \min(\text{CurrentCloseTime} + Y,\ \text{ForcedCloseTime})$$
  Supports three independently combinable triggers inside the last $X$ minutes:
  1. `BID_RECEIVED` — any valid supplier bid arrives inside $[T_{\text{close}} - X, T_{\text{close}})$.
  2. `ANY_RANK_CHANGE` — any supplier changes rank (`L1`, `L2`, `L3`, ...).
  3. `L1_RANK_CHANGE` — the lowest-priced supplier (`L1`) changes identity.
- **Concurrency Safety:** Every bid executes inside a PostgreSQL transaction acquiring `SELECT * FROM rfqs WHERE id = :rfq_id FOR UPDATE`, serializing simultaneous bids per RFQ while allowing independent RFQs to proceed concurrently. WebSocket events broadcast strictly **after** `COMMIT`.
- **Supplier Blind-Auction Privacy:** Buyers see full supplier identities; suppliers see live competitor prices and ranks masked deterministically (`Supplier A`, `Supplier B`) with their own quote labeled `(You)`.
- **Dual Closure Defense:** Server UTC timestamps reject any bid arriving at `now >= bid_close_time` or `now >= forced_close_time` (exact boundary rejected), paired with a lightweight background expiry watcher to emit `AUCTION_CLOSED` / `AUCTION_FORCE_CLOSED` events automatically.

---

## Project Directory Structure

```text
gocomet-british-auction/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/          # user, rfq, rfq_supplier, auction_config, bid, activity_log
│   │   ├── schemas/         # Pydantic v2 request/response DTOs
│   │   ├── dependencies/    # Supabase JWKS/JWT verification & RBAC
│   │   ├── services/        # auction_engine, rfq_service, bid_service, activity_service, expiry_watcher
│   │   ├── websocket/       # Role-aware room ConnectionManager
│   │   ├── routers/         # auth, rfqs, bids, ws
│   │   └── utils/           # UTC time normalization
│   ├── alembic/             # Initial schema migration 0001
│   ├── tests/               # 17 Pytest unit, integration & concurrency tests
│   ├── requirements.txt
│   └── .env.example
├── frontend/                # Standalone React + Vite + Supabase client app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── routes/
│   │   └── utils/
│   ├── package.json
│   └── .env.example
├── docs/
│   ├── HLD.md
│   └── database-schema.md
└── README.md
```

---

## Running the Official FastAPI + Supabase Stack Locally

### 1. Backend (Python + FastAPI + Supabase PostgreSQL)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in DATABASE_URL, SUPABASE_URL, and SUPABASE_JWT_SECRET in .env

alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 2. Run Backend Pytest Suite (All 17 Required Cases)

```bash
cd backend
pytest -v
```

### 3. Standalone Frontend (React + Vite + Supabase Auth)

```bash
cd frontend
npm install
cp .env.example .env
# Fill in VITE_API_BASE_URL, VITE_WS_BASE_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

npm run dev
```

---

## REST & WebSocket API Reference

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/api/auth/me` | Authenticated | Return current user profile & authoritative role |
| `GET` | `/api/auth/profile` | Authenticated | Return application profile |
| `POST` | `/api/auth/register-profile` | Authenticated | One-time profile bootstrap after Supabase signup |
| `POST` | `/api/rfqs/` | `BUYER` | Create RFQ, auction config, and initial invitations |
| `GET` | `/api/rfqs/` | Authenticated | List buyer's RFQs or supplier's invited RFQs |
| `GET` | `/api/rfqs/{rfq_id}` | Buyer / Invited Supplier | Get RFQ details and configuration |
| `POST` | `/api/rfqs/{rfq_id}/suppliers` | `BUYER` | Invite additional suppliers to an RFQ |
| `POST` | `/api/rfqs/{rfq_id}/bids` | Invited `SUPPLIER` | Submit strictly lower quotation (atomic + extension eval) |
| `GET` | `/api/rfqs/{rfq_id}/bids` | Buyer / Invited Supplier | Historical bids (all for buyer, own for supplier) |
| `GET` | `/api/rfqs/{rfq_id}/ranking` | Buyer / Invited Supplier | Live L1/L2/L3 rankings (masked for suppliers) |
| `GET` | `/api/rfqs/{rfq_id}/auction` | Buyer / Invited Supplier | Combined live auction state, rankings, window status |
| `GET` | `/api/rfqs/{rfq_id}/activity` | Buyer / Invited Supplier | Audit log (bids, rank changes, extensions, closures) |
| `WS` | `/ws/auctions/{rfq_id}?token=` | Buyer / Invited Supplier | Live push events (`NEW_BID`, `RANKING_UPDATED`, `AUCTION_EXTENDED`, `AUCTION_CLOSED`, `AUCTION_FORCE_CLOSED`) |
