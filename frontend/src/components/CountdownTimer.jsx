import { useCountdown } from '../hooks/useCountdown';
import { formatDuration, formatStatusLabel, statusColorClass } from '../utils/formatters';

export default function CountdownTimer({ rfq, serverTime, inTriggerWindow }) {
  const effectiveTarget =
    rfq.status === 'UPCOMING'
      ? rfq.bid_start_time
      : new Date(rfq.bid_close_time) < new Date(rfq.forced_close_time)
      ? rfq.bid_close_time
      : rfq.forced_close_time;

  const seconds = useCountdown(effectiveTarget, serverTime);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center justify-between gap-6">
      <div>
        <div className="text-xs font-medium text-slate-500">
          {rfq.status === 'UPCOMING' ? 'Opens In' : rfq.status === 'ACTIVE' ? 'Time Remaining' : 'Auction Status'}
        </div>
        <div className="mt-1 text-2xl font-bold font-mono-tabular text-slate-900">
          {rfq.status === 'ACTIVE' || rfq.status === 'UPCOMING' ? formatDuration(seconds) : formatStatusLabel(rfq.status)}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold ${statusColorClass(rfq.status)}`}>
          {formatStatusLabel(rfq.status)}
        </div>
        {inTriggerWindow && rfq.status === 'ACTIVE' && (
          <div className="text-xs font-medium text-amber-700 mt-0.5">
            Extension Trigger Window Active
          </div>
        )}
      </div>
    </div>
  );
}
