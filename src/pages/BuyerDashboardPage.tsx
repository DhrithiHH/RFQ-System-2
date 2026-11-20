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

export default function BuyerDashboardPage() {
  const [rfqs, setRfqs] = useState<RFQSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rfqApi
      .list()
      .then(setRfqs)
      .finally(() => setLoading(false));
  }, []);

  const activeCount = rfqs.filter((r) => r.status === 'ACTIVE').length;
  const totalBids = rfqs.reduce((acc, r) => acc + r.total_bids, 0);
  const totalExtensions = rfqs.reduce((acc, r) => acc + r.extension_count, 0);
  const forceClosedCount = rfqs.filter((r) => r.status === 'FORCE_CLOSED').length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Buyer Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor active British Auctions, live lowest bids, and automatic deadline extensions.
          </p>
        </div>
        <Link
          to="/buyer/rfqs/new"
          className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap"
        >
          New British Auction RFQ
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Active Auctions</div>
          <div className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900">{activeCount}</div>
          <div className="mt-1 text-xs text-slate-500">{rfqs.length} total RFQs</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Quotations Received</div>
          <div className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900">{totalBids}</div>
          <div className="mt-1 text-xs text-slate-500">Immutable bid entries</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Auto-Extensions Triggered</div>
          <div className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900">{totalExtensions}</div>
          <div className="mt-1 text-xs text-slate-500">Anti-sniping events</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500">Force Closed</div>
          <div className="mt-2 text-2xl font-bold font-mono-tabular text-slate-900">{forceClosedCount}</div>
          <div className="mt-1 text-xs text-slate-500">Reached hard close cap</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Your RFQs</h2>
          <Link to="/auctions" className="text-xs font-medium text-blue-700 hover:underline">
            View full directory
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-slate-500">Loading RFQs...</div>
        ) : rfqs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">No RFQs created yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Create your first British Auction RFQ and invite suppliers to start live bidding.
            </p>
            <Link
              to="/buyer/rfqs/new"
              className="mt-4 inline-block px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800"
            >
              Create RFQ
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-medium">RFQ Name / Ref</th>
                  <th className="py-3 px-4 font-medium">Lane</th>
                  <th className="py-3 px-4 font-medium text-right">Lowest Bid (L1)</th>
                  <th className="py-3 px-4 font-medium text-right">Bids</th>
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
                        {rfq.reference_id} · {rfq.invited_count} supplier{rfq.invited_count === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                      {rfq.origin} → {rfq.destination}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                      {formatCurrency(rfq.lowest_bid_amount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-slate-600">
                      {rfq.total_bids}
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
                        Monitor Room
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
