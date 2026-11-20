import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rfqApi } from '../services/api';
import { useAuctionSocket } from '../hooks/useAuctionSocket';
import CountdownTimer from '../components/CountdownTimer';
import RankingTable from '../components/RankingTable';
import BidSubmissionForm from '../components/BidSubmissionForm';
import ActivityFeed from '../components/ActivityFeed';
import { formatUtcTimestamp } from '../utils/formatters';

export default function AuctionDetailPage() {
  const { rfqId } = useParams();
  const { profile } = useAuth();
  const [auction, setAuction] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [stateData, activityData] = await Promise.all([
      rfqApi.getAuctionState(rfqId),
      rfqApi.getActivity(rfqId),
    ]);
    setAuction(stateData);
    setActivity(activityData);
  }, [rfqId]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useAuctionSocket(rfqId, (event) => {
    if (event.type === 'AUCTION_EXTENDED') {
      setNotice(`Auction extended until ${formatUtcTimestamp(event.data.bid_close_time)} (${event.data.reasons.join(', ')})`);
    }
    refresh();
  });

  if (loading || !auction) {
    return <div className="text-sm text-slate-500">Loading auction room...</div>;
  }

  const { rfq, rankings, in_trigger_window, server_time } = auction;
  const myRanking = rankings.find((r) => r.is_current_user);
  const isSupplier = profile?.role === 'SUPPLIER';

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs text-slate-500 font-mono-tabular">
          {rfq.reference_id} · {rfq.origin} → {rfq.destination} · Pickup {rfq.pickup_date}
        </div>
        <h1 className="text-xl font-bold text-slate-900 mt-1">{rfq.name}</h1>
      </div>

      {notice && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CountdownTimer rfq={rfq} serverTime={server_time} inTriggerWindow={in_trigger_window} />
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 text-xs space-y-1.5 text-slate-600">
          <div className="text-sm font-semibold text-slate-900 mb-2">British Auction Rules</div>
          <div>Trigger Window (X): <strong className="font-mono-tabular text-slate-900">{rfq.auction_config.trigger_window_minutes} min</strong></div>
          <div>Extension Duration (Y): <strong className="font-mono-tabular text-slate-900">{rfq.auction_config.extension_duration_minutes} min</strong></div>
          <div>Forced Close Cap: <strong className="font-mono-tabular text-slate-900">{formatUtcTimestamp(rfq.forced_close_time)}</strong></div>
        </div>
      </div>

      {isSupplier && rfq.status === 'ACTIVE' && (
        <BidSubmissionForm
          previousTotal={myRanking ? myRanking.total_amount : null}
          disabled={rfq.status !== 'ACTIVE'}
          onSubmit={async (payload) => {
            await rfqApi.submitBid(rfqId, payload);
            await refresh();
          }}
        />
      )}

      <RankingTable rankings={rankings} />
      <ActivityFeed logs={activity} />
    </div>
  );
}
