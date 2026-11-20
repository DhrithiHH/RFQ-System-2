import crypto from 'crypto';
import type {
  ActivityEventType,
  ActivityLogRecord,
  AuctionConfig,
  AuctionStateView,
  BidRecord,
  BidSubmissionResultView,
  BidView,
  InvitedSupplierView,
  RankingEntryView,
  RFQDetailView,
  RFQRecord,
  RFQStatus,
  RFQSupplierRecord,
  RFQSummaryView,
  UserProfile,
  UserRole,
} from './types.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RankedBidInternal {
  rank: number;
  bid: BidRecord;
  supplier_name: string;
}

export interface ExtensionEvaluation {
  extended: boolean;
  reasons: string[];
  previous_close_time: string;
  new_close_time: string;
  capped_at_forced_close: boolean;
}

export interface PostCommitBroadcast {
  rfqId: string;
  bid: BidRecord;
  supplierName: string;
  rankingsAfter: RankedBidInternal[];
  aliasMap: Map<string, string>;
  extension: ExtensionEvaluation;
  rfq: RFQRecord;
  serverTime: string;
}

const roundMoney = (n: number): number => Math.round(n * 100) / 100;

const formatUsd = (n: number): string =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export class AuctionStore {
  users = new Map<string, UserProfile>();
  sessions = new Map<string, string>(); // token -> user_id
  rfqs = new Map<string, RFQRecord>();
  configs = new Map<string, AuctionConfig>(); // rfq_id -> config
  invitations: RFQSupplierRecord[] = [];
  bids: BidRecord[] = [];
  activityLogs: ActivityLogRecord[] = [];

  // Per-RFQ async mutex locks mirroring PostgreSQL SELECT ... FOR UPDATE
  private rfqLocks = new Map<string, Promise<void>>();

  constructor() {
    this.seedInitialData();
  }

  private async withRfqLock<T>(rfqId: string, fn: () => T | Promise<T>): Promise<T> {
    const previous = this.rfqLocks.get(rfqId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.rfqLocks.set(rfqId, previous.then(() => current));

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.rfqLocks.get(rfqId) === current) {
        this.rfqLocks.delete(rfqId);
      }
    }
  }

  issueToken(userId: string): string {
    const token = `gc_${crypto.randomBytes(24).toString('hex')}`;
    this.sessions.set(token, userId);
    return token;
  }

  resolveUserByToken(token: string | undefined): UserProfile | null {
    if (!token) return null;
    const userId = this.sessions.get(token);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  findUserByEmail(email: string): UserProfile | undefined {
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) return user;
    }
    return undefined;
  }

  registerUser(name: string, email: string, role: UserRole): UserProfile {
    const normalized = email.trim().toLowerCase();
    if (!name.trim() || !normalized) {
      throw new HttpError(400, 'Name and email are required.');
    }
    if (role !== 'BUYER' && role !== 'SUPPLIER') {
      throw new HttpError(400, 'Role must be BUYER or SUPPLIER.');
    }
    if (this.findUserByEmail(normalized)) {
      throw new HttpError(409, 'An account with this email already exists.');
    }
    const now = new Date().toISOString();
    const user: UserProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: normalized,
      role,
      created_at: now,
      updated_at: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  listSuppliers(): UserProfile[] {
    return Array.from(this.users.values())
      .filter((u) => u.role === 'SUPPLIER')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listDemoAccounts(): Array<{ id: string; name: string; email: string; role: UserRole }> {
    return Array.from(this.users.values()).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));
  }

  computeEffectiveStatus(rfq: RFQRecord, nowMs = Date.now()): RFQStatus {
    if (rfq.status === 'FORCE_CLOSED') return 'FORCE_CLOSED';
    if (rfq.status === 'CLOSED') return 'CLOSED';
    const startMs = Date.parse(rfq.bid_start_time);
    const closeMs = Date.parse(rfq.bid_close_time);
    const forcedMs = Date.parse(rfq.forced_close_time);

    if (nowMs < startMs) return 'UPCOMING';
    if (nowMs >= forcedMs) return 'FORCE_CLOSED';
    if (nowMs >= closeMs) {
      return closeMs >= forcedMs ? 'FORCE_CLOSED' : 'CLOSED';
    }
    return 'ACTIVE';
  }

  syncRfqStatus(rfq: RFQRecord, nowMs = Date.now()): { status: RFQStatus; changed: boolean } {
    const effective = this.computeEffectiveStatus(rfq, nowMs);
    const changed = rfq.status !== effective;
    if (changed) {
      const oldStatus = rfq.status;
      rfq.status = effective;
      rfq.updated_at = new Date(nowMs).toISOString();
      if (effective === 'CLOSED' || effective === 'FORCE_CLOSED') {
        const eventType: ActivityEventType =
          effective === 'FORCE_CLOSED' ? 'AUCTION_FORCE_CLOSED' : 'AUCTION_CLOSED';
        this.recordActivity({
          rfq_id: rfq.id,
          bid_id: null,
          event_type: eventType,
          description:
            effective === 'FORCE_CLOSED'
              ? 'Auction reached forced close limit and closed automatically.'
              : 'Auction bidding window expired and closed.',
          old_value: { status: oldStatus },
          new_value: {
            status: effective,
            bid_close_time: rfq.bid_close_time,
            forced_close_time: rfq.forced_close_time,
          },
          created_at: new Date(nowMs).toISOString(),
        });
      }
    }
    return { status: effective, changed };
  }

  sweepExpiredAuctions(): Array<{ rfqId: string; eventType: ActivityEventType; status: RFQStatus; closedAt: string }> {
    const nowMs = Date.now();
    const closedEvents: Array<{ rfqId: string; eventType: ActivityEventType; status: RFQStatus; closedAt: string }> =
      [];
    for (const rfq of this.rfqs.values()) {
      if (rfq.status === 'UPCOMING' || rfq.status === 'ACTIVE') {
        const { status, changed } = this.syncRfqStatus(rfq, nowMs);
        if (changed && (status === 'CLOSED' || status === 'FORCE_CLOSED')) {
          closedEvents.push({
            rfqId: rfq.id,
            eventType: status === 'FORCE_CLOSED' ? 'AUCTION_FORCE_CLOSED' : 'AUCTION_CLOSED',
            status,
            closedAt: new Date(nowMs).toISOString(),
          });
        }
      }
    }
    return closedEvents;
  }

  isInTriggerWindow(rfq: RFQRecord, config: AuctionConfig, nowMs = Date.now()): boolean {
    const closeMs = Date.parse(rfq.bid_close_time);
    const windowStartMs = closeMs - config.trigger_window_minutes * 60_000;
    return nowMs >= windowStartMs && nowMs < closeMs;
  }

  buildSupplierAliasMap(rfqId: string): Map<string, string> {
    const invited = this.invitations
      .filter((i) => i.rfq_id === rfqId)
      .sort((a, b) => a.invited_at.localeCompare(b.invited_at) || a.id.localeCompare(b.id));
    const map = new Map<string, string>();
    invited.forEach((inv, idx) => {
      const letter = String.fromCharCode(65 + (idx % 26));
      const suffix = idx < 26 ? '' : ` ${Math.floor(idx / 26) + 1}`;
      map.set(inv.supplier_id, `Supplier ${letter}${suffix}`);
    });
    return map;
  }

  calculateRankings(rfqId: string): RankedBidInternal[] {
    const rfqBids = this.bids
      .filter((b) => b.rfq_id === rfqId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

    const latestBySupplier = new Map<string, BidRecord>();
    for (const bid of rfqBids) {
      if (!latestBySupplier.has(bid.supplier_id)) {
        latestBySupplier.set(bid.supplier_id, bid);
      }
    }

    const ordered = Array.from(latestBySupplier.values()).sort((a, b) => {
      if (a.total_amount !== b.total_amount) return a.total_amount - b.total_amount;
      if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
      return a.id.localeCompare(b.id);
    });

    return ordered.map((bid, idx) => ({
      rank: idx + 1,
      bid,
      supplier_name: this.users.get(bid.supplier_id)?.name ?? 'Supplier',
    }));
  }

  serializeRankings(
    rankings: RankedBidInternal[],
    viewerRole: UserRole,
    viewerId: string,
    aliasMap: Map<string, string>
  ): RankingEntryView[] {
    const isBuyer = viewerRole === 'BUYER';
    return rankings.map((entry) => {
      const isSelf = entry.bid.supplier_id === viewerId;
      const supplierLabel = isBuyer
        ? entry.supplier_name
        : isSelf
        ? `${entry.supplier_name} (You)`
        : aliasMap.get(entry.bid.supplier_id) ?? `Supplier ${entry.rank}`;
      return {
        rank: entry.rank,
        rank_label: `L${entry.rank}`,
        supplier_id: isBuyer || isSelf ? entry.bid.supplier_id : null,
        supplier_label: supplierLabel,
        is_current_user: isSelf,
        bid_id: entry.bid.id,
        carrier_name: entry.bid.carrier_name,
        freight_charges: entry.bid.freight_charges,
        origin_charges: entry.bid.origin_charges,
        destination_charges: entry.bid.destination_charges,
        total_amount: entry.bid.total_amount,
        transit_time: entry.bid.transit_time,
        validity_date: entry.bid.validity_date,
        submitted_at: entry.bid.created_at,
      };
    });
  }

  serializeBid(
    bid: BidRecord,
    supplierName: string,
    viewerRole: UserRole,
    viewerId: string,
    aliasMap: Map<string, string>
  ): BidView {
    const isBuyer = viewerRole === 'BUYER';
    const isSelf = bid.supplier_id === viewerId;
    return {
      id: bid.id,
      rfq_id: bid.rfq_id,
      supplier_id: isBuyer || isSelf ? bid.supplier_id : null,
      supplier_label: isBuyer
        ? supplierName
        : isSelf
        ? `${supplierName} (You)`
        : aliasMap.get(bid.supplier_id) ?? 'Competitor',
      is_current_user: isSelf,
      carrier_name: bid.carrier_name,
      freight_charges: bid.freight_charges,
      origin_charges: bid.origin_charges,
      destination_charges: bid.destination_charges,
      total_amount: bid.total_amount,
      transit_time: bid.transit_time,
      validity_date: bid.validity_date,
      created_at: bid.created_at,
    };
  }

  verifyRfqAccess(rfqId: string, user: UserProfile): RFQRecord {
    const rfq = this.rfqs.get(rfqId);
    if (!rfq) throw new HttpError(404, 'RFQ not found.');

    if (user.role === 'BUYER') {
      if (rfq.buyer_id !== user.id) {
        throw new HttpError(403, 'You do not have access to this RFQ.');
      }
    } else {
      const invited = this.invitations.some((i) => i.rfq_id === rfqId && i.supplier_id === user.id);
      if (!invited) {
        throw new HttpError(403, 'You are not invited to this RFQ.');
      }
    }

    this.syncRfqStatus(rfq);
    return rfq;
  }

  private buildSummary(rfq: RFQRecord, nowIso: string): RFQSummaryView {
    const rankings = this.calculateRankings(rfq.id);
    const totalBids = this.bids.filter((b) => b.rfq_id === rfq.id).length;
    const invitedCount = this.invitations.filter((i) => i.rfq_id === rfq.id).length;
    const extensionCount = this.activityLogs.filter(
      (l) => l.rfq_id === rfq.id && l.event_type === 'AUCTION_EXTENDED'
    ).length;

    return {
      ...rfq,
      status: this.computeEffectiveStatus(rfq, Date.parse(nowIso)),
      lowest_bid_amount: rankings.length > 0 ? rankings[0].bid.total_amount : null,
      total_bids: totalBids,
      invited_count: invitedCount,
      extension_count: extensionCount,
      server_time: nowIso,
    };
  }

  listRfqsForUser(user: UserProfile): RFQSummaryView[] {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const all = Array.from(this.rfqs.values());
    const visible =
      user.role === 'BUYER'
        ? all.filter((r) => r.buyer_id === user.id)
        : all.filter((r) => this.invitations.some((i) => i.rfq_id === r.id && i.supplier_id === user.id));

    visible.forEach((r) => this.syncRfqStatus(r, nowMs));
    return visible
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => this.buildSummary(r, nowIso));
  }

  getRfqDetail(rfqId: string, user: UserProfile): RFQDetailView {
    const rfq = this.verifyRfqAccess(rfqId, user);
    const nowIso = new Date().toISOString();
    const summary = this.buildSummary(rfq, nowIso);
    const config = this.configs.get(rfq.id)!;

    const invitedSuppliers: InvitedSupplierView[] =
      user.role === 'BUYER'
        ? this.invitations
            .filter((i) => i.rfq_id === rfq.id)
            .sort((a, b) => a.invited_at.localeCompare(b.invited_at))
            .map((inv) => {
              const sup = this.users.get(inv.supplier_id)!;
              return {
                supplier_id: inv.supplier_id,
                name: sup.name,
                email: sup.email,
                invitation_status: inv.invitation_status,
                invited_at: inv.invited_at,
              };
            })
        : [];

    return {
      ...summary,
      auction_config: config,
      invited_suppliers: invitedSuppliers,
    };
  }

  getAuctionState(rfqId: string, user: UserProfile): AuctionStateView {
    const rfq = this.verifyRfqAccess(rfqId, user);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const detail = this.getRfqDetail(rfqId, user);
    const config = this.configs.get(rfq.id)!;
    const rankings = this.calculateRankings(rfq.id);
    const aliasMap = this.buildSupplierAliasMap(rfq.id);
    const serializedRankings = this.serializeRankings(rankings, user.role, user.id, aliasMap);

    const inWindow = detail.status === 'ACTIVE' && this.isInTriggerWindow(rfq, config, nowMs);
    const effectiveCloseMs = Math.min(Date.parse(rfq.bid_close_time), Date.parse(rfq.forced_close_time));
    const remaining =
      detail.status === 'ACTIVE' ? Math.max(0, Math.floor((effectiveCloseMs - nowMs) / 1000)) : 0;

    return {
      rfq: detail,
      rankings: serializedRankings,
      in_trigger_window: inWindow,
      time_remaining_seconds: remaining,
      server_time: nowIso,
    };
  }

  createRfq(
    buyer: UserProfile,
    input: {
      name: string;
      reference_id: string;
      bid_start_time: string;
      bid_close_time: string;
      forced_close_time: string;
      pickup_date: string;
      origin: string;
      destination: string;
      supplier_ids: string[];
      auction_config: {
        trigger_window_minutes: number;
        extension_duration_minutes: number;
        bid_received_enabled: boolean;
        any_rank_change_enabled: boolean;
        l1_rank_change_enabled: boolean;
      };
    }
  ): RFQDetailView {
    if (buyer.role !== 'BUYER') {
      throw new HttpError(403, 'Only buyers can create RFQs.');
    }

    const startMs = Date.parse(input.bid_start_time);
    const closeMs = Date.parse(input.bid_close_time);
    const forcedMs = Date.parse(input.forced_close_time);

    if (Number.isNaN(startMs) || Number.isNaN(closeMs) || Number.isNaN(forcedMs)) {
      throw new HttpError(422, 'All auction timestamps must be valid ISO-8601 UTC datetimes.');
    }
    if (startMs >= closeMs) {
      throw new HttpError(422, 'Bid start time must be strictly before bid close time.');
    }
    if (forcedMs <= closeMs) {
      throw new HttpError(422, 'Forced close time must be strictly later than initial bid close time.');
    }
    const cfg = input.auction_config;
    if (!cfg || cfg.trigger_window_minutes <= 0 || cfg.extension_duration_minutes <= 0) {
      throw new HttpError(422, 'Trigger window (X) and extension duration (Y) must be positive integers.');
    }
    if (!cfg.bid_received_enabled && !cfg.any_rank_change_enabled && !cfg.l1_rank_change_enabled) {
      throw new HttpError(422, 'At least one auction extension trigger must be enabled.');
    }

    const refId = input.reference_id.trim();
    for (const existing of this.rfqs.values()) {
      if (existing.reference_id.toLowerCase() === refId.toLowerCase()) {
        throw new HttpError(409, `RFQ reference ID '${refId}' already exists.`);
      }
    }

    const uniqueSupplierIds = Array.from(new Set(input.supplier_ids ?? []));
    for (const sid of uniqueSupplierIds) {
      const user = this.users.get(sid);
      if (!user || user.role !== 'SUPPLIER') {
        throw new HttpError(400, `Invalid or non-supplier user ID: ${sid}`);
      }
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const rfqId = crypto.randomUUID();
    const status: RFQStatus = startMs <= nowMs ? 'ACTIVE' : 'UPCOMING';

    const rfq: RFQRecord = {
      id: rfqId,
      buyer_id: buyer.id,
      name: input.name.trim(),
      reference_id: refId,
      bid_start_time: new Date(startMs).toISOString(),
      initial_bid_close_time: new Date(closeMs).toISOString(),
      bid_close_time: new Date(closeMs).toISOString(),
      forced_close_time: new Date(forcedMs).toISOString(),
      pickup_date: input.pickup_date,
      origin: input.origin.trim(),
      destination: input.destination.trim(),
      status,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const auctionConfig: AuctionConfig = {
      id: crypto.randomUUID(),
      rfq_id: rfqId,
      trigger_window_minutes: Math.floor(cfg.trigger_window_minutes),
      extension_duration_minutes: Math.floor(cfg.extension_duration_minutes),
      bid_received_enabled: Boolean(cfg.bid_received_enabled),
      any_rank_change_enabled: Boolean(cfg.any_rank_change_enabled),
      l1_rank_change_enabled: Boolean(cfg.l1_rank_change_enabled),
    };

    this.rfqs.set(rfqId, rfq);
    this.configs.set(rfqId, auctionConfig);

    for (const sid of uniqueSupplierIds) {
      this.invitations.push({
        id: crypto.randomUUID(),
        rfq_id: rfqId,
        supplier_id: sid,
        invitation_status: 'INVITED',
        invited_at: nowIso,
      });
    }

    return this.getRfqDetail(rfqId, buyer);
  }

  inviteSuppliers(rfqId: string, buyer: UserProfile, supplierIds: string[]): RFQDetailView {
    const rfq = this.rfqs.get(rfqId);
    if (!rfq) throw new HttpError(404, 'RFQ not found.');
    if (buyer.role !== 'BUYER' || rfq.buyer_id !== buyer.id) {
      throw new HttpError(403, 'Only the owning buyer can invite suppliers.');
    }

    const unique = Array.from(new Set(supplierIds));
    for (const sid of unique) {
      const user = this.users.get(sid);
      if (!user || user.role !== 'SUPPLIER') {
        throw new HttpError(400, `Invalid or non-supplier user ID: ${sid}`);
      }
    }

    const nowIso = new Date().toISOString();
    for (const sid of unique) {
      const exists = this.invitations.some((i) => i.rfq_id === rfqId && i.supplier_id === sid);
      if (!exists) {
        this.invitations.push({
          id: crypto.randomUUID(),
          rfq_id: rfqId,
          supplier_id: sid,
          invitation_status: 'INVITED',
          invited_at: nowIso,
        });
      }
    }

    return this.getRfqDetail(rfqId, buyer);
  }

  async submitBid(
    rfqId: string,
    supplier: UserProfile,
    input: {
      carrier_name: string;
      freight_charges: number;
      origin_charges: number;
      destination_charges: number;
      transit_time: number;
      validity_date: string;
    }
  ): Promise<{ response: BidSubmissionResultView; broadcast: PostCommitBroadcast }> {
    if (supplier.role !== 'SUPPLIER') {
      throw new HttpError(403, 'Only suppliers can submit bids.');
    }

    return this.withRfqLock(rfqId, () => {
      const rfq = this.rfqs.get(rfqId);
      if (!rfq) throw new HttpError(404, 'RFQ not found.');

      const config = this.configs.get(rfqId);
      if (!config) throw new HttpError(500, 'Auction configuration missing.');

      const invited = this.invitations.some((i) => i.rfq_id === rfqId && i.supplier_id === supplier.id);
      if (!invited) {
        throw new HttpError(403, 'Supplier is not invited to this RFQ.');
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const startMs = Date.parse(rfq.bid_start_time);
      const closeMs = Date.parse(rfq.bid_close_time);
      const forcedMs = Date.parse(rfq.forced_close_time);

      if (rfq.status === 'UPCOMING' && startMs <= nowMs) {
        rfq.status = 'ACTIVE';
      }

      if (nowMs < startMs) {
        throw new HttpError(400, 'Auction has not started yet.');
      }
      if (rfq.status === 'CLOSED' || rfq.status === 'FORCE_CLOSED') {
        throw new HttpError(400, `Auction is already ${rfq.status.toLowerCase().replace('_', ' ')}.`);
      }
      if (nowMs >= forcedMs) {
        this.syncRfqStatus(rfq, nowMs);
        throw new HttpError(400, 'Auction has reached its forced close time and no longer accepts bids.');
      }
      if (nowMs >= closeMs) {
        this.syncRfqStatus(rfq, nowMs);
        throw new HttpError(400, 'Auction bidding window has closed.');
      }

      const freight = roundMoney(Number(input.freight_charges));
      const origin = roundMoney(Number(input.origin_charges));
      const destination = roundMoney(Number(input.destination_charges));
      const transitTime = Math.floor(Number(input.transit_time));

      if (
        !input.carrier_name?.trim() ||
        Number.isNaN(freight) ||
        Number.isNaN(origin) ||
        Number.isNaN(destination) ||
        freight < 0 ||
        origin < 0 ||
        destination < 0 ||
        !Number.isFinite(transitTime) ||
        transitTime <= 0
      ) {
        throw new HttpError(422, 'All charge values must be non-negative and transit time must be positive.');
      }

      const totalAmount = roundMoney(freight + origin + destination);

      // Find supplier's latest accepted bid
      const previousBid = this.bids
        .filter((b) => b.rfq_id === rfqId && b.supplier_id === supplier.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];

      if (previousBid && totalAmount >= previousBid.total_amount) {
        throw new HttpError(
          400,
          `New quotation total (${formatUsd(totalAmount)}) must be strictly lower than your previous bid (${formatUsd(previousBid.total_amount)}).`
        );
      }

      const rankingsBefore = this.calculateRankings(rfqId);

      const newBid: BidRecord = {
        id: crypto.randomUUID(),
        rfq_id: rfqId,
        supplier_id: supplier.id,
        carrier_name: input.carrier_name.trim(),
        freight_charges: freight,
        origin_charges: origin,
        destination_charges: destination,
        total_amount: totalAmount,
        transit_time: transitTime,
        validity_date: input.validity_date,
        created_at: nowIso,
      };
      this.bids.push(newBid);

      const rankingsAfter = this.calculateRankings(rfqId);

      // Evaluate extension triggers
      const previousCloseIso = rfq.bid_close_time;
      let extension: ExtensionEvaluation = {
        extended: false,
        reasons: [],
        previous_close_time: previousCloseIso,
        new_close_time: previousCloseIso,
        capped_at_forced_close: false,
      };

      const beforeOrder = rankingsBefore.map((r) => r.bid.supplier_id);
      const afterOrder = rankingsAfter.map((r) => r.bid.supplier_id);
      const anyRankChanged =
        beforeOrder.length !== afterOrder.length ||
        beforeOrder.some((sid, idx) => sid !== afterOrder[idx]);
      const beforeL1 = beforeOrder[0] ?? null;
      const afterL1 = afterOrder[0] ?? null;
      const l1Changed = beforeL1 !== afterL1;

      if (this.isInTriggerWindow(rfq, config, nowMs)) {
        const reasons: string[] = [];
        if (config.bid_received_enabled) reasons.push('BID_RECEIVED');
        if (config.any_rank_change_enabled && anyRankChanged) reasons.push('ANY_RANK_CHANGE');
        if (config.l1_rank_change_enabled && l1Changed) reasons.push('L1_RANK_CHANGE');

        if (reasons.length > 0) {
          const candidateCloseMs = closeMs + config.extension_duration_minutes * 60_000;
          const cappedCloseMs = Math.min(candidateCloseMs, forcedMs);
          const capped = candidateCloseMs > forcedMs;

          if (cappedCloseMs > closeMs) {
            const newCloseIso = new Date(cappedCloseMs).toISOString();
            rfq.bid_close_time = newCloseIso;
            rfq.updated_at = nowIso;
            extension = {
              extended: true,
              reasons,
              previous_close_time: previousCloseIso,
              new_close_time: newCloseIso,
              capped_at_forced_close: capped,
            };
          } else {
            extension = {
              extended: false,
              reasons: [],
              previous_close_time: previousCloseIso,
              new_close_time: previousCloseIso,
              capped_at_forced_close: true,
            };
          }
        }
      }

      // 1. Log BID_SUBMITTED
      this.recordActivity({
        rfq_id: rfqId,
        bid_id: newBid.id,
        event_type: 'BID_SUBMITTED',
        description: `${supplier.name} submitted a quote of ${formatUsd(totalAmount)} via ${newBid.carrier_name}.`,
        old_value: previousBid ? { previous_total_amount: previousBid.total_amount } : null,
        new_value: {
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          carrier_name: newBid.carrier_name,
          total_amount: totalAmount,
        },
        created_at: nowIso,
      });

      // 2. Log RANK_CHANGED if rankings changed
      if (anyRankChanged) {
        const oldL1Entry = rankingsBefore[0] ?? null;
        const newL1Entry = rankingsAfter[0];
        this.recordActivity({
          rfq_id: rfqId,
          bid_id: newBid.id,
          event_type: 'RANK_CHANGED',
          description: l1Changed
            ? `Lowest bidder (L1) changed to ${newL1Entry.supplier_name} at ${formatUsd(newL1Entry.bid.total_amount)}.`
            : `Supplier rankings shifted following ${supplier.name}'s quote of ${formatUsd(totalAmount)}.`,
          old_value: oldL1Entry
            ? {
                l1_supplier_id: oldL1Entry.bid.supplier_id,
                l1_supplier_name: oldL1Entry.supplier_name,
                l1_amount: oldL1Entry.bid.total_amount,
              }
            : null,
          new_value: {
            l1_supplier_id: newL1Entry.bid.supplier_id,
            l1_supplier_name: newL1Entry.supplier_name,
            l1_amount: newL1Entry.bid.total_amount,
            supplier_id: supplier.id,
            supplier_name: supplier.name,
          },
          created_at: nowIso,
        });
      }

      // 3. Log AUCTION_EXTENDED
      if (extension.extended) {
        const capNote = extension.capped_at_forced_close ? ' (capped at forced close time)' : '';
        this.recordActivity({
          rfq_id: rfqId,
          bid_id: newBid.id,
          event_type: 'AUCTION_EXTENDED',
          description: `Auction extended by ${config.extension_duration_minutes} min triggered by ${extension.reasons.join(', ')}${capNote}.`,
          old_value: { bid_close_time: extension.previous_close_time },
          new_value: {
            bid_close_time: extension.new_close_time,
            forced_close_time: rfq.forced_close_time,
            reasons: extension.reasons,
            capped_at_forced_close: extension.capped_at_forced_close,
          },
          created_at: nowIso,
        });
      }

      const aliasMap = this.buildSupplierAliasMap(rfqId);
      const response: BidSubmissionResultView = {
        bid: this.serializeBid(newBid, supplier.name, supplier.role, supplier.id, aliasMap),
        rankings: this.serializeRankings(rankingsAfter, supplier.role, supplier.id, aliasMap),
        auction_extended: extension.extended,
        extension_reasons: extension.reasons,
        previous_close_time: extension.previous_close_time,
        current_close_time: rfq.bid_close_time,
        forced_close_time: rfq.forced_close_time,
        server_time: nowIso,
      };

      const broadcast: PostCommitBroadcast = {
        rfqId,
        bid: newBid,
        supplierName: supplier.name,
        rankingsAfter,
        aliasMap,
        extension,
        rfq: { ...rfq },
        serverTime: nowIso,
      };

      return { response, broadcast };
    });
  }

  listBidsForUser(rfqId: string, user: UserProfile): BidView[] {
    this.verifyRfqAccess(rfqId, user);
    const aliasMap = this.buildSupplierAliasMap(rfqId);
    const filtered = this.bids
      .filter((b) => b.rfq_id === rfqId && (user.role === 'BUYER' || b.supplier_id === user.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));

    return filtered.map((bid) =>
      this.serializeBid(
        bid,
        this.users.get(bid.supplier_id)?.name ?? 'Supplier',
        user.role,
        user.id,
        aliasMap
      )
    );
  }

  getRankingsForUser(rfqId: string, user: UserProfile): RankingEntryView[] {
    this.verifyRfqAccess(rfqId, user);
    const rankings = this.calculateRankings(rfqId);
    const aliasMap = this.buildSupplierAliasMap(rfqId);
    return this.serializeRankings(rankings, user.role, user.id, aliasMap);
  }

  listActivityForUser(rfqId: string, user: UserProfile): ActivityLogRecord[] {
    this.verifyRfqAccess(rfqId, user);
    const aliasMap = this.buildSupplierAliasMap(rfqId);
    const isBuyer = user.role === 'BUYER';

    return this.activityLogs
      .filter((l) => l.rfq_id === rfqId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      .map((log) => {
        if (isBuyer) return log;
        let description = log.description;
        const oldVal = log.old_value ? { ...log.old_value } : null;
        const newVal = log.new_value ? { ...log.new_value } : null;

        const redact = (obj: Record<string, unknown> | null, idKey: string, nameKey: string) => {
          if (!obj || typeof obj[idKey] !== 'string') return;
          const sid = obj[idKey] as string;
          const label = sid === user.id ? 'You' : aliasMap.get(sid) ?? 'Competitor';
          if (typeof obj[nameKey] === 'string') {
            description = description.split(obj[nameKey] as string).join(label);
            obj[nameKey] = label;
          }
          if (sid !== user.id) {
            delete obj[idKey];
          }
        };

        redact(newVal, 'supplier_id', 'supplier_name');
        redact(oldVal, 'l1_supplier_id', 'l1_supplier_name');
        redact(newVal, 'l1_supplier_id', 'l1_supplier_name');

        return {
          ...log,
          description,
          old_value: oldVal,
          new_value: newVal,
        };
      });
  }

  private recordActivity(entry: Omit<ActivityLogRecord, 'id'>): ActivityLogRecord {
    const rec: ActivityLogRecord = { id: crypto.randomUUID(), ...entry };
    this.activityLogs.push(rec);
    return rec;
  }

  private seedInitialData(): void {
    const nowMs = Date.now();
    const iso = (offsetMin: number) => new Date(nowMs + offsetMin * 60_000).toISOString();
    const dateOffset = (days: number) => new Date(nowMs + days * 86_400_000).toISOString().slice(0, 10);

    const buyer: UserProfile = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Ananya Sharma (Acme Logistics)',
      email: 'buyer@acmelogistics.com',
      role: 'BUYER',
      created_at: iso(-1440),
      updated_at: iso(-1440),
    };
    const supMaersk: UserProfile = {
      id: '22222222-2222-4222-8222-222222222221',
      name: 'Maersk Line Partner',
      email: 'desk@maerskpartner.com',
      role: 'SUPPLIER',
      created_at: iso(-1440),
      updated_at: iso(-1440),
    };
    const supMsc: UserProfile = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'MSC Freight Desk',
      email: 'quotes@mscfreight.com',
      role: 'SUPPLIER',
      created_at: iso(-1440),
      updated_at: iso(-1440),
    };
    const supHapag: UserProfile = {
      id: '22222222-2222-4222-8222-222222222223',
      name: 'Hapag-Lloyd Cargo',
      email: 'rfq@hapagcargo.com',
      role: 'SUPPLIER',
      created_at: iso(-1440),
      updated_at: iso(-1440),
    };
    const supCma: UserProfile = {
      id: '22222222-2222-4222-8222-222222222224',
      name: 'CMA CGM Express',
      email: 'pricing@cmacgmexpress.com',
      role: 'SUPPLIER',
      created_at: iso(-1440),
      updated_at: iso(-1440),
    };

    [buyer, supMaersk, supMsc, supHapag, supCma].forEach((u) => this.users.set(u.id, u));

    // RFQ 1: Live auction ALREADY inside the 10-minute trigger window so users can immediately test automatic extension!
    const rfq1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
    this.rfqs.set(rfq1Id, {
      id: rfq1Id,
      buyer_id: buyer.id,
      name: 'Nhava Sheva to Rotterdam — 40ft HC FCL',
      reference_id: 'RFQ-2026-401',
      bid_start_time: iso(-25),
      initial_bid_close_time: iso(7),
      bid_close_time: iso(7),
      forced_close_time: iso(22),
      pickup_date: dateOffset(10),
      origin: 'Nhava Sheva, IN',
      destination: 'Rotterdam, NL',
      status: 'ACTIVE',
      created_at: iso(-40),
      updated_at: iso(-5),
    });
    this.configs.set(rfq1Id, {
      id: crypto.randomUUID(),
      rfq_id: rfq1Id,
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      bid_received_enabled: true,
      any_rank_change_enabled: true,
      l1_rank_change_enabled: true,
    });
    [supMaersk, supMsc, supHapag, supCma].forEach((s, i) => {
      this.invitations.push({
        id: crypto.randomUUID(),
        rfq_id: rfq1Id,
        supplier_id: s.id,
        invitation_status: 'INVITED',
        invited_at: iso(-39 + i),
      });
    });

    const b1: BidRecord = {
      id: crypto.randomUUID(),
      rfq_id: rfq1Id,
      supplier_id: supMaersk.id,
      carrier_name: 'Maersk MECL',
      freight_charges: 2650,
      origin_charges: 280,
      destination_charges: 220,
      total_amount: 3150,
      transit_time: 21,
      validity_date: dateOffset(30),
      created_at: iso(-19),
    };
    const b2: BidRecord = {
      id: crypto.randomUUID(),
      rfq_id: rfq1Id,
      supplier_id: supMsc.id,
      carrier_name: 'MSC Indus Express',
      freight_charges: 2490,
      origin_charges: 260,
      destination_charges: 240,
      total_amount: 2990,
      transit_time: 23,
      validity_date: dateOffset(30),
      created_at: iso(-14),
    };
    const b3: BidRecord = {
      id: crypto.randomUUID(),
      rfq_id: rfq1Id,
      supplier_id: supHapag.id,
      carrier_name: 'Hapag-Lloyd IOS',
      freight_charges: 2540,
      origin_charges: 275,
      destination_charges: 235,
      total_amount: 3050,
      transit_time: 20,
      validity_date: dateOffset(35),
      created_at: iso(-11),
    };
    this.bids.push(b1, b2, b3);
    this.recordActivity({
      rfq_id: rfq1Id,
      bid_id: b1.id,
      event_type: 'BID_SUBMITTED',
      description: `${supMaersk.name} submitted a quote of $3,150.00 via Maersk MECL.`,
      old_value: null,
      new_value: { supplier_id: supMaersk.id, supplier_name: supMaersk.name, total_amount: 3150 },
      created_at: iso(-19),
    });
    this.recordActivity({
      rfq_id: rfq1Id,
      bid_id: b2.id,
      event_type: 'RANK_CHANGED',
      description: `Lowest bidder (L1) changed to ${supMsc.name} at $2,990.00.`,
      old_value: { l1_supplier_id: supMaersk.id, l1_supplier_name: supMaersk.name, l1_amount: 3150 },
      new_value: { l1_supplier_id: supMsc.id, l1_supplier_name: supMsc.name, l1_amount: 2990 },
      created_at: iso(-14),
    });
    this.recordActivity({
      rfq_id: rfq1Id,
      bid_id: b3.id,
      event_type: 'BID_SUBMITTED',
      description: `${supHapag.name} submitted a quote of $3,050.00 via Hapag-Lloyd IOS.`,
      old_value: null,
      new_value: { supplier_id: supHapag.id, supplier_name: supHapag.name, total_amount: 3050 },
      created_at: iso(-11),
    });

    // RFQ 2: Active auction with L1-only trigger
    const rfq2Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
    this.rfqs.set(rfq2Id, {
      id: rfq2Id,
      buyer_id: buyer.id,
      name: 'Shanghai to Los Angeles — Air Freight 4.5T',
      reference_id: 'RFQ-2026-402',
      bid_start_time: iso(-15),
      initial_bid_close_time: iso(45),
      bid_close_time: iso(45),
      forced_close_time: iso(75),
      pickup_date: dateOffset(4),
      origin: 'Shanghai PVG, CN',
      destination: 'Los Angeles LAX, US',
      status: 'ACTIVE',
      created_at: iso(-30),
      updated_at: iso(-10),
    });
    this.configs.set(rfq2Id, {
      id: crypto.randomUUID(),
      rfq_id: rfq2Id,
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      bid_received_enabled: false,
      any_rank_change_enabled: false,
      l1_rank_change_enabled: true,
    });
    [supMaersk, supMsc, supCma].forEach((s, i) => {
      this.invitations.push({
        id: crypto.randomUUID(),
        rfq_id: rfq2Id,
        supplier_id: s.id,
        invitation_status: 'INVITED',
        invited_at: iso(-29 + i),
      });
    });
    const b4: BidRecord = {
      id: crypto.randomUUID(),
      rfq_id: rfq2Id,
      supplier_id: supCma.id,
      carrier_name: 'CMA CGM Air Cargo',
      freight_charges: 11200,
      origin_charges: 640,
      destination_charges: 580,
      total_amount: 12420,
      transit_time: 3,
      validity_date: dateOffset(14),
      created_at: iso(-8),
    };
    this.bids.push(b4);
    this.recordActivity({
      rfq_id: rfq2Id,
      bid_id: b4.id,
      event_type: 'BID_SUBMITTED',
      description: `${supCma.name} submitted a quote of $12,420.00 via CMA CGM Air Cargo.`,
      old_value: null,
      new_value: { supplier_id: supCma.id, supplier_name: supCma.name, total_amount: 12420 },
      created_at: iso(-8),
    });

    // RFQ 3: Upcoming scheduled auction
    const rfq3Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
    this.rfqs.set(rfq3Id, {
      id: rfq3Id,
      buyer_id: buyer.id,
      name: 'Shenzhen to Hamburg — 20ft FCL Industrial Parts',
      reference_id: 'RFQ-2026-403',
      bid_start_time: iso(25),
      initial_bid_close_time: iso(85),
      bid_close_time: iso(85),
      forced_close_time: iso(115),
      pickup_date: dateOffset(14),
      origin: 'Yantian, CN',
      destination: 'Hamburg, DE',
      status: 'UPCOMING',
      created_at: iso(-20),
      updated_at: iso(-20),
    });
    this.configs.set(rfq3Id, {
      id: crypto.randomUUID(),
      rfq_id: rfq3Id,
      trigger_window_minutes: 8,
      extension_duration_minutes: 4,
      bid_received_enabled: false,
      any_rank_change_enabled: true,
      l1_rank_change_enabled: false,
    });
    [supMaersk, supHapag, supCma].forEach((s, i) => {
      this.invitations.push({
        id: crypto.randomUUID(),
        rfq_id: rfq3Id,
        supplier_id: s.id,
        invitation_status: 'INVITED',
        invited_at: iso(-19 + i),
      });
    });

    // RFQ 4: Force-closed completed auction demonstrating full audit history & forced close cap
    const rfq4Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
    this.rfqs.set(rfq4Id, {
      id: rfq4Id,
      buyer_id: buyer.id,
      name: 'Chennai to Felixstowe — 40ft Reefer Cold Chain',
      reference_id: 'RFQ-2026-398',
      bid_start_time: iso(-180),
      initial_bid_close_time: iso(-120),
      bid_close_time: iso(-110),
      forced_close_time: iso(-110),
      pickup_date: dateOffset(6),
      origin: 'Chennai, IN',
      destination: 'Felixstowe, UK',
      status: 'FORCE_CLOSED',
      created_at: iso(-200),
      updated_at: iso(-110),
    });
    this.configs.set(rfq4Id, {
      id: crypto.randomUUID(),
      rfq_id: rfq4Id,
      trigger_window_minutes: 10,
      extension_duration_minutes: 5,
      bid_received_enabled: true,
      any_rank_change_enabled: false,
      l1_rank_change_enabled: true,
    });
    [supMaersk, supMsc, supHapag].forEach((s, i) => {
      this.invitations.push({
        id: crypto.randomUUID(),
        rfq_id: rfq4Id,
        supplier_id: s.id,
        invitation_status: 'INVITED',
        invited_at: iso(-199 + i),
      });
    });

    const f1: BidRecord = {
      id: crypto.randomUUID(),
      rfq_id: rfq4Id,
      supplier_id: supMaersk.id,
      carrier_name: 'Maersk Reefer Express',
      freight_charges: 4200,
      origin_charges: 340,
      destination_charges: 310,
      total_amount: 4850,
      transit_time: 24,
      validity_date: dateOffset(25),
      created_at: iso(-150),
    };
    const f2: BidRecord = {
      id: crypto.randomUUID(),
      rfq_id: rfq4Id,
      supplier_id: supHapag.id,
      carrier_name: 'Hapag ColdChain',
      freight_charges: 4050,
      origin_charges: 330,
      destination_charges: 290,
      total_amount: 4670,
      transit_time: 23,
      validity_date: dateOffset(25),
      created_at: iso(-123),
    };
    const f3: BidRecord = {
      id: crypto.randomUUID(),
      rfq_id: rfq4Id,
      supplier_id: supMaersk.id,
      carrier_name: 'Maersk Reefer Express',
      freight_charges: 3920,
      origin_charges: 320,
      destination_charges: 290,
      total_amount: 4530,
      transit_time: 24,
      validity_date: dateOffset(25),
      created_at: iso(-117),
    };
    this.bids.push(f1, f2, f3);
    this.recordActivity({
      rfq_id: rfq4Id,
      bid_id: f2.id,
      event_type: 'AUCTION_EXTENDED',
      description: 'Auction extended by 5 min triggered by BID_RECEIVED, L1_RANK_CHANGE.',
      old_value: { bid_close_time: iso(-120) },
      new_value: { bid_close_time: iso(-115), reasons: ['BID_RECEIVED', 'L1_RANK_CHANGE'] },
      created_at: iso(-123),
    });
    this.recordActivity({
      rfq_id: rfq4Id,
      bid_id: f3.id,
      event_type: 'AUCTION_EXTENDED',
      description: 'Auction extended by 5 min triggered by BID_RECEIVED, L1_RANK_CHANGE (capped at forced close time).',
      old_value: { bid_close_time: iso(-115) },
      new_value: { bid_close_time: iso(-110), reasons: ['BID_RECEIVED', 'L1_RANK_CHANGE'], capped_at_forced_close: true },
      created_at: iso(-117),
    });
    this.recordActivity({
      rfq_id: rfq4Id,
      bid_id: null,
      event_type: 'AUCTION_FORCE_CLOSED',
      description: 'Auction reached forced close limit and closed automatically.',
      old_value: { status: 'ACTIVE' },
      new_value: { status: 'FORCE_CLOSED', forced_close_time: iso(-110) },
      created_at: iso(-110),
    });
  }
}

export const auctionStore = new AuctionStore();
