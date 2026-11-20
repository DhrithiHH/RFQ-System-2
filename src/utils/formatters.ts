import type { RFQStatus } from '../types';

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export function formatStatusLabel(status: RFQStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'UPCOMING':
      return 'Upcoming';
    case 'CLOSED':
      return 'Closed';
    case 'FORCE_CLOSED':
      return 'Force Closed';
  }
}

export function statusTextClass(status: RFQStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'text-emerald-700';
    case 'UPCOMING':
      return 'text-amber-700';
    case 'FORCE_CLOSED':
      return 'text-red-700';
    case 'CLOSED':
      return 'text-slate-600';
  }
}

export function formatEventLabel(eventType: string): string {
  switch (eventType) {
    case 'BID_SUBMITTED':
      return 'Bid Submitted';
    case 'RANK_CHANGED':
      return 'Rank Changed';
    case 'AUCTION_EXTENDED':
      return 'Auction Extended';
    case 'AUCTION_CLOSED':
      return 'Auction Closed';
    case 'AUCTION_FORCE_CLOSED':
      return 'Force Closed';
    default:
      return eventType.replaceAll('_', ' ');
  }
}

export function eventTextClass(eventType: string): string {
  switch (eventType) {
    case 'AUCTION_EXTENDED':
      return 'text-amber-700';
    case 'AUCTION_FORCE_CLOSED':
      return 'text-red-700';
    case 'RANK_CHANGED':
      return 'text-blue-700';
    case 'BID_SUBMITTED':
      return 'text-emerald-700';
    default:
      return 'text-slate-600';
  }
}

export function formatMinutesDelta(initialIso: string, currentIso: string): number {
  const diffMs = Date.parse(currentIso) - Date.parse(initialIso);
  return Math.max(0, Math.round(diffMs / 60_000));
}
