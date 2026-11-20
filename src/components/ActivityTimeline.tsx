import type { ActivityLog } from '../types';
import { eventTextClass, formatEventLabel, formatTimestamp } from '../utils/formatters';

interface ActivityTimelineProps {
  logs: ActivityLog[];
}

export default function ActivityTimeline({ logs }: ActivityTimelineProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Auction Activity History</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable audit trail of bids, ranking updates, time extensions, and closure events
          </p>
        </div>
        <span className="text-xs font-mono-tabular text-slate-500">
          {logs.length} event{logs.length === 1 ? '' : 's'}
        </span>
      </div>

      {logs.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">No activity recorded yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {logs.map((log) => {
            const oldClose =
              typeof log.old_value?.bid_close_time === 'string'
                ? log.old_value.bid_close_time
                : null;
            const newClose =
              typeof log.new_value?.bid_close_time === 'string'
                ? log.new_value.bid_close_time
                : null;
            const reasons = Array.isArray(log.new_value?.reasons)
              ? (log.new_value?.reasons as string[])
              : [];

            return (
              <li key={log.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={`font-semibold ${eventTextClass(log.event_type)}`}>
                    {formatEventLabel(log.event_type)}
                  </span>
                  <span className="font-mono-tabular text-slate-500">
                    {formatTimestamp(log.created_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{log.description}</p>
                {oldClose && newClose && (
                  <div className="mt-1.5 text-xs font-mono-tabular text-slate-500">
                    Close time shifted: {formatTimestamp(oldClose)} → {formatTimestamp(newClose)}
                    {reasons.length > 0 && ` · Trigger: ${reasons.join(', ')}`}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
