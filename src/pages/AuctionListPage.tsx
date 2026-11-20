import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { rfqApi } from '../services/api';
import type { RFQStatus, RFQSummary } from '../types';
import {
  formatCurrency,
  formatStatusLabel,
  formatTimestamp,
  statusTextClass,
} from '../utils/formatters';

type StatusFilter = 'ALL' | RFQStatus;

export default function AuctionListPage() {
  const { user } = useAuth();
  const [rfqs, setRfqs] = useState<RFQSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    rfqApi
      .list()
      .then(setRfqs)
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filtered = rfqs.filter((r) => {
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.reference_id.toLowerCase().includes(q) ||
      r.origin.toLowerCase().includes(q) ||
      r.destination.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const tabs: Array<{ value: StatusFilter; label: string }> = [
    { value: 'ALL', label: 'All' },
    { value: 'ACTIVE', label: 'Active' },
    { value: 'UPCOMING', label: 'Upcoming' },
    { value: 'CLOSED', label: 'Closed' },
    { value: 'FORCE_CLOSED', label: 'Force Closed' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {user?.role === 'BUYER' ? 'Auction Listing' : 'Invited RFQs'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track current lowest bids, live close deadlines, forced close limits, and auction status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search RFQ, lane, or ref..."
              className="pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-600 w-60"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  statusFilter === tab.value
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading auctions...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">No matching auctions found</p>
            <p className="text-xs text-slate-500 mt-1">
              Adjust your status filter or search terms to inspect other RFQs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-medium">RFQ Name / Reference</th>
                  <th className="py-3 px-4 font-medium">Origin → Destination</th>
                  <th className="py-3 px-4 font-medium text-right">Current Lowest Bid</th>
                  <th className="py-3 px-4 font-medium">Current Bid Close</th>
                  <th className="py-3 px-4 font-medium">Forced Close</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((rfq) => (
                  <tr key={rfq.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{rfq.name}</div>
                      <div className="text-xs text-slate-500 font-mono-tabular">
                        {rfq.reference_id} · {rfq.total_bids} bid{rfq.total_bids === 1 ? '' : 's'}
                        {rfq.extension_count > 0 && ` · Extended ${rfq.extension_count}x`}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                      {rfq.origin} → {rfq.destination}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                      {formatCurrency(rfq.lowest_bid_amount)}
                    </td>
                    <td className="py-3.5 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                      {formatTimestamp(rfq.bid_close_time)}
                    </td>
                    <td className="py-3.5 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                      {formatTimestamp(rfq.forced_close_time)}
                    </td>
                    <td className={`py-3.5 px-4 text-xs font-semibold whitespace-nowrap ${statusTextClass(rfq.status)}`}>
                      {formatStatusLabel(rfq.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <Link
                        to={`/auctions/${rfq.id}`}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Open Auction
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
