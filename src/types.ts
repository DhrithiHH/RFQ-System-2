export type UserRole = 'BUYER' | 'SUPPLIER';
export type RFQStatus = 'UPCOMING' | 'ACTIVE' | 'CLOSED' | 'FORCE_CLOSED';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface DemoAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuctionConfig {
  id: string;
  rfq_id: string;
  trigger_window_minutes: number;
  extension_duration_minutes: number;
  bid_received_enabled: boolean;
  any_rank_change_enabled: boolean;
  l1_rank_change_enabled: boolean;
}

export interface InvitedSupplier {
  supplier_id: string;
  name: string;
  email: string;
  invitation_status: string;
  invited_at: string;
}

export interface RFQSummary {
  id: string;
  buyer_id: string;
  name: string;
  reference_id: string;
  origin: string;
  destination: string;
  pickup_date: string;
  bid_start_time: string;
  initial_bid_close_time: string;
  bid_close_time: string;
  forced_close_time: string;
  status: RFQStatus;
  lowest_bid_amount: number | null;
  total_bids: number;
  invited_count: number;
  extension_count: number;
  server_time: string;
}

export interface RFQDetail extends RFQSummary {
  auction_config: AuctionConfig;
  invited_suppliers: InvitedSupplier[];
}

export interface BidItem {
  id: string;
  rfq_id: string;
  supplier_id: string | null;
  supplier_label: string;
  is_current_user: boolean;
  carrier_name: string;
  freight_charges: number;
  origin_charges: number;
  destination_charges: number;
  total_amount: number;
  transit_time: number;
  validity_date: string;
  created_at: string;
}

export interface RankingEntry {
  rank: number;
  rank_label: string;
  supplier_id: string | null;
  supplier_label: string;
  is_current_user: boolean;
  bid_id: string;
  carrier_name: string;
  freight_charges: number;
  origin_charges: number;
  destination_charges: number;
  total_amount: number;
  transit_time: number;
  validity_date: string;
  submitted_at: string;
}

export interface ActivityLog {
  id: string;
  rfq_id: string;
  bid_id: string | null;
  event_type: string;
  description: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface AuctionState {
  rfq: RFQDetail;
  rankings: RankingEntry[];
  in_trigger_window: boolean;
  time_remaining_seconds: number;
  server_time: string;
}

export interface BidSubmissionResult {
  bid: BidItem;
  rankings: RankingEntry[];
  auction_extended: boolean;
  extension_reasons: string[];
  previous_close_time: string;
  current_close_time: string;
  forced_close_time: string;
  server_time: string;
}

export interface AuctionWsEvent {
  type:
    | 'NEW_BID'
    | 'RANKING_UPDATED'
    | 'AUCTION_EXTENDED'
    | 'AUCTION_CLOSED'
    | 'AUCTION_FORCE_CLOSED'
    | 'PONG';
  rfq_id?: string;
  data?: Record<string, unknown>;
}
