import type { RankingEntry, UserRole } from '../types';
import { formatCurrency, formatTimestamp } from '../utils/formatters';

interface RankingTableProps {
  rankings: RankingEntry[];
  viewerRole: UserRole;
}

export default function RankingTable({ rankings, viewerRole }: RankingTableProps) {
  if (rankings.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
        <p className="text-sm font-medium text-slate-800">No quotations submitted yet</p>
        <p className="text-xs text-slate-500 mt-1">
          Rankings (L1, L2, L3) calculate automatically as soon as invited suppliers submit bids.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Live Supplier Rankings</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {viewerRole === 'BUYER'
              ? 'Full supplier identities visible · Ranked by each supplier’s latest accepted quotation'
              : 'Competitor identities masked for blind auction fairness · Ranked by lowest total quote'}
          </p>
        </div>
        <span className="text-xs font-mono-tabular text-slate-500 whitespace-nowrap">
          {rankings.length} ranked bidder{rankings.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 font-medium">Rank</th>
              <th className="py-3 px-4 font-medium">Supplier</th>
              <th className="py-3 px-4 font-medium">Carrier</th>
              <th className="py-3 px-4 font-medium text-right">Freight</th>
              <th className="py-3 px-4 font-medium text-right">Origin</th>
              <th className="py-3 px-4 font-medium text-right">Destination</th>
              <th className="py-3 px-4 font-medium text-right">Total Quote</th>
              <th className="py-3 px-4 font-medium text-right">Transit</th>
              <th className="py-3 px-4 font-medium">Validity</th>
              <th className="py-3 px-4 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rankings.map((row) => (
              <tr
                key={row.bid_id}
                className={
                  row.is_current_user
                    ? 'bg-blue-50/50'
                    : row.rank === 1
                    ? 'bg-emerald-50/30 hover:bg-emerald-50/50'
                    : 'hover:bg-slate-50'
                }
              >
                <td className="py-3 px-4 font-mono-tabular font-semibold whitespace-nowrap">
                  <span className={row.rank === 1 ? 'text-emerald-700' : 'text-slate-700'}>
                    {row.rank_label}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                  {row.supplier_label}
                </td>
                <td className="py-3 px-4 text-slate-700 whitespace-nowrap">{row.carrier_name}</td>
                <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                  {formatCurrency(row.freight_charges)}
                </td>
                <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                  {formatCurrency(row.origin_charges)}
                </td>
                <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                  {formatCurrency(row.destination_charges)}
                </td>
                <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                  {formatCurrency(row.total_amount)}
                </td>
                <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 whitespace-nowrap">
                  {row.transit_time}d
                </td>
                <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                  {row.validity_date}
                </td>
                <td className="py-3 px-4 font-mono-tabular text-xs text-slate-500 whitespace-nowrap">
                  {formatTimestamp(row.submitted_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
