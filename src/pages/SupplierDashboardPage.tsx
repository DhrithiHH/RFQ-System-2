import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rfqApi } from '../services/api';
import type { RFQSummary } from '../types';
import {
  formatCurrency,
  formatStatusLabel,
  formatTimestamp,
  statusTextClass,
} from '../utils/formatters';

export default function SupplierDashboardPage() {
  const [rfqs, setRfqs] = useState<RFQSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rfqApi
      .list()
      .then(setRfqs)
      .finally(() => setLoading(false));
  }, []);

  const activeRfqs = rfqs.filter((r) => r.status === 'ACTIVE');
  const upcomingRfqs = rfqs.filter((r) => r.status === 'UPCOMING');
  const closedRfqs = rfqs.filter((r) => r.status === 'CLOSED' || r.status === 'FORCE_CLOSED');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Supplier Bidding Desk</h1>
        <p className="text-sm text-slate-500 mt-1">
          View your invited RFQs, track live L1 prices, and submit lower quotations before the deadline.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Live Auctions Open</div>
          <div className="mt-2 text-2xl font-bold font-mono-tabular text-emerald-700">
            {activeRfqs.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Accepting lower quotations now</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Upcoming Invitations</div>
          <div className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900">
            {upcomingRfqs.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Scheduled to open soon</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Completed Auctions</div>
          <div className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900">
            {closedRfqs.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Closed or force closed</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Invited RFQs</h2>
          <span className="text-xs text-slate-500">{rfqs.length} total</span>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading invited RFQs...</div>
        ) : rfqs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            You have not been invited to any RFQs yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-medium">RFQ Name / Ref</th>
                  <th className="py-3 px-4 font-medium">Lane</th>
                  <th className="py-3 px-4 font-medium text-right">Current L1 Quote</th>
                  <th className="py-3 px-4 font-medium">Current Close</th>
                  <th className="py-3 px-4 font-medium">Forced Close</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rfqs.map((rfq) => (
                  <tr key={rfq.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{rfq.name}</div>
                      <div className="text-xs text-slate-500 font-mono-tabular">
                        {rfq.reference_id} · Pickup {rfq.pickup_date}
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
                        {rfq.status === 'ACTIVE' ? 'Place Bid' : 'View Details'}
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
