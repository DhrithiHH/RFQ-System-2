export function formatCurrency(amount) {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatUtcTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export function formatStatusLabel(status) {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'UPCOMING':
      return 'Upcoming';
    case 'CLOSED':
      return 'Closed';
    case 'FORCE_CLOSED':
      return 'Force Closed';
    default:
      return status;
  }
}

export function statusColorClass(status) {
  switch (status) {
    case 'ACTIVE':
      return 'text-emerald-700';
    case 'UPCOMING':
      return 'text-amber-700';
    case 'FORCE_CLOSED':
      return 'text-red-700';
    default:
      return 'text-slate-600';
  }
}
