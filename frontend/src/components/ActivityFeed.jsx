import { formatUtcTimestamp } from '../utils/formatters';

export default function ActivityFeed({ logs }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Auction Activity History</h2>
        <span className="text-xs text-slate-500">{logs.length} event(s)</span>
      </div>
      {logs.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">No auction activity recorded yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {logs.map((log) => (
            <li key={log.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{log.event_type.replaceAll('_', ' ')}</span>
                <span className="font-mono-tabular">{formatUtcTimestamp(log.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-800">{log.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
