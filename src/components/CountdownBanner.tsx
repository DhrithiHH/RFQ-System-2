import { useCountdown } from '../hooks/useCountdown';
import type { RFQDetail } from '../types';
import {
  formatDuration,
  formatMinutesDelta,
  formatStatusLabel,
  formatTimestamp,
  statusTextClass,
} from '../utils/formatters';

interface CountdownBannerProps {
  rfq: RFQDetail;
  serverTime: string;
  inTriggerWindow: boolean;
  wsConnected: boolean;
}

export default function CountdownBanner({
  rfq,
  serverTime,
  inTriggerWindow,
  wsConnected,
}: CountdownBannerProps) {
  const effectiveTarget =
    rfq.status === 'UPCOMING'
      ? rfq.bid_start_time
      : Date.parse(rfq.bid_close_time) < Date.parse(rfq.forced_close_time)
      ? rfq.bid_close_time
      : rfq.forced_close_time;

  const remaining = useCountdown(effectiveTarget, serverTime);
  const extendedMinutes = formatMinutesDelta(rfq.initial_bid_close_time, rfq.bid_close_time);
  const reachedCap = Date.parse(rfq.bid_close_time) >= Date.parse(rfq.forced_close_time);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className={`font-semibold ${statusTextClass(rfq.status)}`}>
              {formatStatusLabel(rfq.status)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{wsConnected ? 'Live updates connected' : 'Reconnecting live stream'}</span>
            {inTriggerWindow && rfq.status === 'ACTIVE' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-700">Inside {rfq.auction_config.trigger_window_minutes}m trigger window</span>
              </>
            )}
          </div>

          <div className="mt-2 flex items-baseline gap-4">
            <div className="text-3xl font-bold font-mono-tabular tracking-tight text-slate-900">
              {rfq.status === 'ACTIVE' || rfq.status === 'UPCOMING'
                ? formatDuration(remaining)
                : formatStatusLabel(rfq.status)}
            </div>
            <span className="text-xs text-slate-500">
              {rfq.status === 'UPCOMING'
                ? 'until bidding opens'
                : rfq.status === 'ACTIVE'
                ? 'until current close'
                : 'bidding ended'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-xs">
          <div>
            <div className="text-slate-500">Initial Close</div>
            <div className="mt-0.5 font-mono-tabular font-medium text-slate-800">
              {formatTimestamp(rfq.initial_bid_close_time)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Current Close</div>
            <div className="mt-0.5 font-mono-tabular font-semibold text-slate-900">
              {formatTimestamp(rfq.bid_close_time)}
              {extendedMinutes > 0 && (
                <span className="ml-1.5 text-amber-700 font-medium">+{extendedMinutes}m</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Forced Close Cap</div>
            <div className="mt-0.5 font-mono-tabular font-medium text-red-700">
              {formatTimestamp(rfq.forced_close_time)}
              {reachedCap && <span className="ml-1.5 text-red-700">(Cap Reached)</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
