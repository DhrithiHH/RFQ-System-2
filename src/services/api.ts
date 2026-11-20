import type {
  ActivityLog,
  AuctionState,
  BidItem,
  BidSubmissionResult,
  DemoAccount,
  RankingEntry,
  RFQDetail,
  RFQSummary,
  UserProfile,
  UserRole,
} from '../types';

const TOKEN_STORAGE_KEY = 'gocomet_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.detail === 'string' ? data.detail : `Request failed (${res.status})`);
  }
  return data as T;
}

export const authApi = {
  demoAccounts: () => request<DemoAccount[]>('/api/auth/demo-accounts'),
  createSession: (payload: {
    email: string;
    name?: string;
    role?: UserRole;
    mode?: 'login' | 'signup';
  }) =>
    request<{ access_token: string; user: UserProfile }>('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  me: () => request<UserProfile>('/api/auth/me'),
  listSuppliers: () => request<UserProfile[]>('/api/auth/suppliers'),
};

export const rfqApi = {
  list: () => request<RFQSummary[]>('/api/rfqs'),
  create: (payload: {
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
  }) =>
    request<RFQDetail>('/api/rfqs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getDetail: (rfqId: string) => request<RFQDetail>(`/api/rfqs/${rfqId}`),
  inviteSuppliers: (rfqId: string, supplierIds: string[]) =>
    request<RFQDetail>(`/api/rfqs/${rfqId}/suppliers`, {
      method: 'POST',
      body: JSON.stringify({ supplier_ids: supplierIds }),
    }),
  getAuctionState: (rfqId: string) => request<AuctionState>(`/api/rfqs/${rfqId}/auction`),
  getRanking: (rfqId: string) => request<RankingEntry[]>(`/api/rfqs/${rfqId}/ranking`),
  getActivity: (rfqId: string) => request<ActivityLog[]>(`/api/rfqs/${rfqId}/activity`),
  listBids: (rfqId: string) => request<BidItem[]>(`/api/rfqs/${rfqId}/bids`),
  submitBid: (
    rfqId: string,
    payload: {
      carrier_name: string;
      freight_charges: number;
      origin_charges: number;
      destination_charges: number;
      transit_time: number;
      validity_date: string;
    }
  ) =>
    request<BidSubmissionResult>(`/api/rfqs/${rfqId}/bids`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
