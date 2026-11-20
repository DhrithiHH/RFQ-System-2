import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rfqApi } from '../services/api';
import { formatCurrency, formatStatusLabel, formatUtcTimestamp, statusColorClass } from '../utils/formatters';

export default function AuctionListPage() {
  const [rfqs, setRfqs] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rfqApi
      .list()
      .then(setRfqs)
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'ALL' ? rfqs : rfqs.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">British Auctions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live overview of RFQ deadlines, lowest bids, and forced close caps.</p>
        </div>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
          {['ALL', 'ACTIVE', 'UPCOMING', 'CLOSED', 'FORCE_CLOSED'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                filter === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {tab === 'ALL' ? 'All' : formatStatusLabel(tab)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading auctions...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-sm text-slate-500">No auctions match the current filter.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-medium">RFQ Name / Ref</th>
                <th className="py-3 px-4 font-medium">Lane</th>
                <th className="py-3 px-4 font-medium text-right">Lowest Bid</th>
                <th className="py-3 px-4 font-medium">Current Close</th>
                <th className="py-3 px-4 font-medium">Forced Close</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((rfq) => (
                <tr key={rfq.id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900">{rfq.name}</div>
                    <div className="text-xs text-slate-500 font-mono-tabular">{rfq.reference_id}</div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">
                    {rfq.origin} → {rfq.destination}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                    {formatCurrency(rfq.lowest_bid_amount)}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs text-slate-600">
                    {formatUtcTimestamp(rfq.bid_close_time)}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs text-slate-600">
                    {formatUtcTimestamp(rfq.forced_close_time)}
                  </td>
                  <td className={`py-3.5 px-4 text-xs font-semibold ${statusColorClass(rfq.status)}`}>
                    {formatStatusLabel(rfq.status)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <Link
                      to={`/auctions/${rfq.id}`}
                      className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                    >
                      Open Room
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
