import type { BidItem, UserRole } from '../types';
import { formatCurrency, formatTimestamp } from '../utils/formatters';

interface BidHistoryTableProps {
  bids: BidItem[];
  viewerRole: UserRole;
}

export default function BidHistoryTable({ bids, viewerRole }: BidHistoryTableProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            {viewerRole === 'BUYER' ? 'Complete Quotation History' : 'Your Quotation History'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Every submitted bid is stored immutably without overwriting prior rounds
          </p>
        </div>
        <span className="text-xs font-mono-tabular text-slate-500">
          {bids.length} record{bids.length === 1 ? '' : 's'}
        </span>
      </div>

      {bids.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">No historical bids yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-medium">Submitted</th>
                <th className="py-3 px-4 font-medium">Supplier</th>
                <th className="py-3 px-4 font-medium">Carrier</th>
                <th className="py-3 px-4 font-medium text-right">Freight</th>
                <th className="py-3 px-4 font-medium text-right">Origin</th>
                <th className="py-3 px-4 font-medium text-right">Destination</th>
                <th className="py-3 px-4 font-medium text-right">Total</th>
                <th className="py-3 px-4 font-medium text-right">Transit</th>
                <th className="py-3 px-4 font-medium">Validity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bids.map((bid) => (
                <tr key={bid.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono-tabular text-xs text-slate-500 whitespace-nowrap">
                    {formatTimestamp(bid.created_at)}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                    {bid.supplier_label}
                  </td>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{bid.carrier_name}</td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                    {formatCurrency(bid.freight_charges)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                    {formatCurrency(bid.origin_charges)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                    {formatCurrency(bid.destination_charges)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                    {formatCurrency(bid.total_amount)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                    {bid.transit_time}d
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600">
                    {bid.validity_date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
