import { formatCurrency, formatUtcTimestamp } from '../utils/formatters';

export default function RankingTable({ rankings }) {
  if (!rankings || rankings.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
        No bids submitted yet. Rankings will populate as soon as the first quotation arrives.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Live Supplier Rankings</h2>
        <span className="text-xs text-slate-500">{rankings.length} active quote(s)</span>
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
              <th className="py-3 px-4 font-medium text-right">Dest.</th>
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
                className={row.is_current_user ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'}
              >
                <td className="py-3 px-4 font-mono-tabular font-semibold">
                  <span className={row.rank === 1 ? 'text-emerald-700' : 'text-slate-700'}>
                    {row.rank_label}
                  </span>
                </td>
                <td className="py-3 px-4 font-medium text-slate-900">{row.supplier_label}</td>
                <td className="py-3 px-4 text-slate-700">{row.carrier_name}</td>
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
                <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                  {row.transit_time}d
                </td>
                <td className="py-3 px-4 font-mono-tabular text-slate-600">{row.validity_date}</td>
                <td className="py-3 px-4 font-mono-tabular text-xs text-slate-500">
                  {formatUtcTimestamp(row.submitted_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
