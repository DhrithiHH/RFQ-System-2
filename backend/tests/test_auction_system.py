from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

import pytest
from fastapi import HTTPException

from app.models.activity_log import ActivityEventType, AuctionActivityLog
from app.models.rfq import RFQ
from app.schemas.bid import BidCreate
from app.services.bid_service import BidService
from tests.conftest import make_auth_headers


def _rfq_payload(
    *,
    reference_id: str,
    start_offset_min: int = -10,
    close_offset_min: int = 30,
    forced_offset_min: int = 60,
    trigger_window_minutes: int = 10,
    extension_duration_minutes: int = 5,
    bid_received_enabled: bool = True,
    any_rank_change_enabled: bool = False,
    l1_rank_change_enabled: bool = False,
    supplier_ids: list[str] | None = None,
) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "name": "Mumbai to Rotterdam 40ft FCL",
        "reference_id": reference_id,
        "bid_start_time": (now + timedelta(minutes=start_offset_min)).isoformat(),
        "bid_close_time": (now + timedelta(minutes=close_offset_min)).isoformat(),
        "forced_close_time": (now + timedelta(minutes=forced_offset_min)).isoformat(),
        "pickup_date": (date.today() + timedelta(days=7)).isoformat(),
        "origin": "Nhava Sheva, IN",
        "destination": "Rotterdam, NL",
        "supplier_ids": supplier_ids or [],
        "auction_config": {
            "trigger_window_minutes": trigger_window_minutes,
            "extension_duration_minutes": extension_duration_minutes,
            "bid_received_enabled": bid_received_enabled,
            "any_rank_change_enabled": any_rank_change_enabled,
            "l1_rank_change_enabled": l1_rank_change_enabled,
        },
    }


def _bid_payload(freight: str, origin: str = "100.00", dest: str = "100.00", carrier: str = "Maersk") -> dict:
    return {
        "carrier_name": carrier,
        "freight_charges": freight,
        "origin_charges": origin,
        "destination_charges": dest,
        "transit_time": 18,
        "validity_date": (date.today() + timedelta(days=30)).isoformat(),
    }


# 1. RFQ creation with valid configuration
def test_create_rfq_valid_configuration(client, seed_users):
    buyer = seed_users["buyer"]
    sup_a = seed_users["sup_a"]
    payload = _rfq_payload(reference_id="RFQ-TEST-001", supplier_ids=[str(sup_a.id)])

    resp = client.post("/api/rfqs/", json=payload, headers=make_auth_headers(buyer))
    assert resp.status_code == 201
    data = resp.json()
    assert data["reference_id"] == "RFQ-TEST-001"
    assert data["status"] == "ACTIVE"
    assert data["auction_config"]["trigger_window_minutes"] == 10
    assert len(data["invited_suppliers"]) == 1


# 2. Forced close time validation
def test_rfq_forced_close_time_validation(client, seed_users):
    buyer = seed_users["buyer"]
    payload = _rfq_payload(reference_id="RFQ-INVALID-CLOSE", close_offset_min=30, forced_offset_min=20)

    resp = client.post("/api/rfqs/", json=payload, headers=make_auth_headers(buyer))
    assert resp.status_code == 422


# 3. Supplier invitation validation
def test_supplier_invitation_validation(client, seed_users):
    buyer = seed_users["buyer"]
    payload = _rfq_payload(reference_id="RFQ-INV-VAL", supplier_ids=[str(buyer.id)])

    resp = client.post("/api/rfqs/", json=payload, headers=make_auth_headers(buyer))
    assert resp.status_code == 400
    assert "non-supplier" in resp.json()["detail"].lower()


# 4. Bid submission by an invited supplier
def test_bid_submission_by_invited_supplier(client, seed_users):
    buyer, sup_a = seed_users["buyer"], seed_users["sup_a"]
    rfq = client.post(
        "/api/rfqs/",
        json=_rfq_payload(reference_id="RFQ-BID-001", supplier_ids=[str(sup_a.id)]),
        headers=make_auth_headers(buyer),
    ).json()

    resp = client.post(
        f"/api/rfqs/{rfq['id']}/bids",
        json=_bid_payload("2000.00", "250.00", "150.00"),
        headers=make_auth_headers(sup_a),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert Decimal(body["bid"]["total_amount"]) == Decimal("2400.00")
    assert body["rankings"][0]["rank_label"] == "L1"


# 5. Rejection of bids from non-invited suppliers
def test_reject_bid_from_non_invited_supplier(client, seed_users):
    buyer, sup_a, outsider = seed_users["buyer"], seed_users["sup_a"], seed_users["outsider"]
    rfq = client.post(
        "/api/rfqs/",
        json=_rfq_payload(reference_id="RFQ-BID-002", supplier_ids=[str(sup_a.id)]),
        headers=make_auth_headers(buyer),
    ).json()

    resp = client.post(
        f"/api/rfqs/{rfq['id']}/bids",
        json=_bid_payload("1800.00"),
        headers=make_auth_headers(outsider),
    )
    assert resp.status_code == 403


# 6. Rejection of bids before auction start
def test_reject_bid_before_auction_start(client, seed_users):
    buyer, sup_a = seed_users["buyer"], seed_users["sup_a"]
    rfq = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-UPCOMING",
            start_offset_min=15,
            close_offset_min=45,
            forced_offset_min=60,
            supplier_ids=[str(sup_a.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()

    resp = client.post(
        f"/api/rfqs/{rfq['id']}/bids",
        json=_bid_payload("1900.00"),
        headers=make_auth_headers(sup_a),
    )
    assert resp.status_code == 400
    assert "not started" in resp.json()["detail"].lower()


# 7. Rejection of bids after auction closure (and exact close boundary)
def test_reject_bid_at_or_after_close_time(db, client, seed_users):
    buyer, sup_a = seed_users["buyer"], seed_users["sup_a"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(reference_id="RFQ-EXACT-CLOSE", supplier_ids=[str(sup_a.id)]),
        headers=make_auth_headers(buyer),
    ).json()
    rfq = db.get(RFQ, uuid.UUID(rfq_json["id"]))
    close_ts = rfq.bid_close_time

    # Exact close timestamp must be rejected
    with pytest.raises(HTTPException) as exc:
        BidService.submit_bid_sync(
            db,
            rfq.id,
            sup_a,
            BidCreate(**_bid_payload("1500.00")),
            now_override=close_ts,
        )
    assert exc.value.status_code == 400


# 8. Rejection of bids at forced close time
def test_reject_bid_at_forced_close_time(db, client, seed_users):
    buyer, sup_a = seed_users["buyer"], seed_users["sup_a"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(reference_id="RFQ-FORCED-CLOSE", supplier_ids=[str(sup_a.id)]),
        headers=make_auth_headers(buyer),
    ).json()
    rfq = db.get(RFQ, uuid.UUID(rfq_json["id"]))

    with pytest.raises(HTTPException) as exc:
        BidService.submit_bid_sync(
            db,
            rfq.id,
            sup_a,
            BidCreate(**_bid_payload("1500.00")),
            now_override=rfq.forced_close_time,
        )
    assert exc.value.status_code == 400
    assert "forced close" in exc.value.detail.lower()


# 9. Supplier cannot submit a higher or equal bid
def test_supplier_cannot_submit_higher_or_equal_bid(client, seed_users):
    buyer, sup_a = seed_users["buyer"], seed_users["sup_a"]
    rfq = client.post(
        "/api/rfqs/",
        json=_rfq_payload(reference_id="RFQ-LOWER-ONLY", supplier_ids=[str(sup_a.id)]),
        headers=make_auth_headers(buyer),
    ).json()

    first = client.post(
        f"/api/rfqs/{rfq['id']}/bids",
        json=_bid_payload("2000.00", "100.00", "100.00"),
        headers=make_auth_headers(sup_a),
    )
    assert first.status_code == 201

    equal = client.post(
        f"/api/rfqs/{rfq['id']}/bids",
        json=_bid_payload("2000.00", "100.00", "100.00"),
        headers=make_auth_headers(sup_a),
    )
    assert equal.status_code == 400

    higher = client.post(
        f"/api/rfqs/{rfq['id']}/bids",
        json=_bid_payload("2100.00", "100.00", "100.00"),
        headers=make_auth_headers(sup_a),
    )
    assert higher.status_code == 400


# 10. Correct ranking calculation (L1, L2, L3 + supplier privacy masking)
def test_ranking_calculation_and_privacy(client, seed_users):
    buyer = seed_users["buyer"]
    sup_a, sup_b, sup_c = seed_users["sup_a"], seed_users["sup_b"], seed_users["sup_c"]
    rfq = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-RANK-001",
            supplier_ids=[str(sup_a.id), str(sup_b.id), str(sup_c.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()

    client.post(f"/api/rfqs/{rfq['id']}/bids", json=_bid_payload("3000.00"), headers=make_auth_headers(sup_a))
    client.post(f"/api/rfqs/{rfq['id']}/bids", json=_bid_payload("2500.00"), headers=make_auth_headers(sup_b))
    client.post(f"/api/rfqs/{rfq['id']}/bids", json=_bid_payload("2800.00"), headers=make_auth_headers(sup_c))

    # Buyer sees full identities
    buyer_rank = client.get(f"/api/rfqs/{rfq['id']}/ranking", headers=make_auth_headers(buyer)).json()
    assert [r["supplier_label"] for r in buyer_rank] == ["MSC Freight", "Hapag Express", "Maersk Partner"]
    assert [r["rank_label"] for r in buyer_rank] == ["L1", "L2", "L3"]

    # Supplier A sees masked competitor names and "(You)" for self
    sup_a_rank = client.get(f"/api/rfqs/{rfq['id']}/ranking", headers=make_auth_headers(sup_a)).json()
    assert sup_a_rank[0]["supplier_id"] is None
    assert "MSC" not in sup_a_rank[0]["supplier_label"]
    assert sup_a_rank[2]["is_current_user"] is True


# 11. Bid-received extension
def test_extension_bid_received(db, client, seed_users):
    buyer, sup_a = seed_users["buyer"], seed_users["sup_a"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-EXT-BID",
            close_offset_min=30,
            forced_offset_min=50,
            trigger_window_minutes=10,
            extension_duration_minutes=5,
            bid_received_enabled=True,
            supplier_ids=[str(sup_a.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()
    rfq = db.get(RFQ, uuid.UUID(rfq_json["id"]))
    orig_close = rfq.bid_close_time

    # Bid 2 minutes before close (inside 10-min trigger window)
    res, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_a, BidCreate(**_bid_payload("2000.00")), now_override=orig_close - timedelta(minutes=2)
    )
    assert res.auction_extended is True
    assert "BID_RECEIVED" in res.extension_reasons
    assert res.current_close_time == orig_close + timedelta(minutes=5)


# 12. Any-rank-change extension
def test_extension_any_rank_change(db, client, seed_users):
    buyer = seed_users["buyer"]
    sup_a, sup_b, sup_c = seed_users["sup_a"], seed_users["sup_b"], seed_users["sup_c"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-EXT-ANY",
            close_offset_min=30,
            forced_offset_min=50,
            trigger_window_minutes=10,
            extension_duration_minutes=5,
            bid_received_enabled=False,
            any_rank_change_enabled=True,
            l1_rank_change_enabled=False,
            supplier_ids=[str(sup_a.id), str(sup_b.id), str(sup_c.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()
    rfq = db.get(RFQ, uuid.UUID(rfq_json["id"]))
    orig_close = rfq.bid_close_time

    # Establish initial ranking OUTSIDE trigger window: A=2000 (L1), B=2500 (L2), C=2800 (L3)
    outside = orig_close - timedelta(minutes=20)
    BidService.submit_bid_sync(db, rfq.id, sup_a, BidCreate(**_bid_payload("2000.00")), now_override=outside)
    BidService.submit_bid_sync(db, rfq.id, sup_b, BidCreate(**_bid_payload("2500.00")), now_override=outside)
    BidService.submit_bid_sync(db, rfq.id, sup_c, BidCreate(**_bid_payload("2800.00")), now_override=outside)

    # C lowers to 2700 inside window -> still L3, no rank change -> NO extension
    no_ext, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_c, BidCreate(**_bid_payload("2700.00")), now_override=orig_close - timedelta(minutes=3)
    )
    assert no_ext.auction_extended is False

    # C lowers to 2400 inside window -> flips L2/L3 (not L1) -> EXTENDS
    ext, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_c, BidCreate(**_bid_payload("2400.00")), now_override=orig_close - timedelta(minutes=2)
    )
    assert ext.auction_extended is True
    assert "ANY_RANK_CHANGE" in ext.extension_reasons
    assert ext.current_close_time == orig_close + timedelta(minutes=5)


# 13. L1-change extension
def test_extension_l1_change_only(db, client, seed_users):
    buyer = seed_users["buyer"]
    sup_a, sup_b, sup_c = seed_users["sup_a"], seed_users["sup_b"], seed_users["sup_c"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-EXT-L1",
            close_offset_min=30,
            forced_offset_min=50,
            trigger_window_minutes=10,
            extension_duration_minutes=5,
            bid_received_enabled=False,
            any_rank_change_enabled=False,
            l1_rank_change_enabled=True,
            supplier_ids=[str(sup_a.id), str(sup_b.id), str(sup_c.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()
    rfq = db.get(RFQ, uuid.UUID(rfq_json["id"]))
    orig_close = rfq.bid_close_time

    outside = orig_close - timedelta(minutes=20)
    BidService.submit_bid_sync(db, rfq.id, sup_a, BidCreate(**_bid_payload("2000.00")), now_override=outside)
    BidService.submit_bid_sync(db, rfq.id, sup_b, BidCreate(**_bid_payload("2500.00")), now_override=outside)
    BidService.submit_bid_sync(db, rfq.id, sup_c, BidCreate(**_bid_payload("2800.00")), now_override=outside)

    # C overtakes B for L2, but A remains L1 -> NO extension
    no_ext, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_c, BidCreate(**_bid_payload("2400.00")), now_override=orig_close - timedelta(minutes=3)
    )
    assert no_ext.auction_extended is False

    # B beats A for L1 -> EXTENDS
    ext, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_b, BidCreate(**_bid_payload("1900.00")), now_override=orig_close - timedelta(minutes=2)
    )
    assert ext.auction_extended is True
    assert "L1_RANK_CHANGE" in ext.extension_reasons


# 14 & 15. Multiple extensions & cap at forced close time
def test_multiple_extensions_and_forced_close_cap(db, client, seed_users):
    buyer, sup_a, sup_b = seed_users["buyer"], seed_users["sup_a"], seed_users["sup_b"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-EXT-CAP",
            close_offset_min=30,
            forced_offset_min=38,  # Only 8 min headroom above initial close
            trigger_window_minutes=10,
            extension_duration_minutes=5,
            bid_received_enabled=True,
            supplier_ids=[str(sup_a.id), str(sup_b.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()
    rfq = db.get(RFQ, uuid.UUID(rfq_json["id"]))
    orig_close = rfq.bid_close_time
    forced_close = rfq.forced_close_time

    # Extension 1: +5 min -> orig_close + 5
    r1, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_a, BidCreate(**_bid_payload("2000.00")), now_override=orig_close - timedelta(minutes=2)
    )
    assert r1.auction_extended is True
    assert r1.current_close_time == orig_close + timedelta(minutes=5)

    # Extension 2: +5 min would exceed forced_close (+8 min) -> capped exactly at forced_close
    r2, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_b, BidCreate(**_bid_payload("1900.00")), now_override=orig_close + timedelta(minutes=3)
    )
    assert r2.auction_extended is True
    assert r2.current_close_time == forced_close

    # Extension 3: already at forced_close -> cannot extend further
    r3, _ = BidService.submit_bid_sync(
        db, rfq.id, sup_a, BidCreate(**_bid_payload("1850.00")), now_override=forced_close - timedelta(minutes=1)
    )
    assert r3.auction_extended is False
    assert r3.current_close_time == forced_close


# 16. Activity log creation
def test_activity_logs_recorded(db, client, seed_users):
    buyer, sup_a = seed_users["buyer"], seed_users["sup_a"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-LOGS-001",
            close_offset_min=5,
            forced_offset_min=20,
            trigger_window_minutes=10,
            extension_duration_minutes=5,
            bid_received_enabled=True,
            supplier_ids=[str(sup_a.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()

    resp = client.post(
        f"/api/rfqs/{rfq_json['id']}/bids",
        json=_bid_payload("2200.00"),
        headers=make_auth_headers(sup_a),
    )
    assert resp.status_code == 201

    logs = client.get(f"/api/rfqs/{rfq_json['id']}/activity", headers=make_auth_headers(buyer)).json()
    event_types = {log["event_type"] for log in logs}
    assert ActivityEventType.BID_SUBMITTED.value in event_types
    assert ActivityEventType.RANK_CHANGED.value in event_types
    assert ActivityEventType.AUCTION_EXTENDED.value in event_types


# 17. Simultaneous bid submissions
def test_simultaneous_bid_submissions(db_session_factory, client, seed_users):
    buyer = seed_users["buyer"]
    sup_a, sup_b, sup_c = seed_users["sup_a"], seed_users["sup_b"], seed_users["sup_c"]
    rfq_json = client.post(
        "/api/rfqs/",
        json=_rfq_payload(
            reference_id="RFQ-CONCURRENT-001",
            close_offset_min=5,
            forced_offset_min=30,
            trigger_window_minutes=10,
            extension_duration_minutes=5,
            bid_received_enabled=True,
            supplier_ids=[str(sup_a.id), str(sup_b.id), str(sup_c.id)],
        ),
        headers=make_auth_headers(buyer),
    ).json()
    rfq_id = uuid.UUID(rfq_json["id"])

    def place(supplier, amount: str):
        with db_session_factory() as session:
            return BidService.submit_bid_sync(
                session, rfq_id, supplier, BidCreate(**_bid_payload(amount))
            )

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(place, sup_a, "2300.00"),
            executor.submit(place, sup_b, "2100.00"),
            executor.submit(place, sup_c, "2200.00"),
        ]
        results = [f.result()[0] for f in futures]

    assert len(results) == 3
    rankings = client.get(f"/api/rfqs/{rfq_id}/ranking", headers=make_auth_headers(buyer)).json()
    assert len(rankings) == 3
    assert Decimal(rankings[0]["total_amount"]) == Decimal("2300.00")  # 2100 + 100 + 100
    assert Decimal(rankings[1]["total_amount"]) == Decimal("2400.00")  # 2200 + 100 + 100
    assert Decimal(rankings[2]["total_amount"]) == Decimal("2500.00")  # 2300 + 100 + 100
