import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi, rfqApi } from '../services/api';
import { useAuctionSocket } from '../hooks/useAuctionSocket';
import type { ActivityLog, AuctionState, AuctionWsEvent, BidItem, UserProfile } from '../types';
import CountdownBanner from '../components/CountdownBanner';
import RankingTable from '../components/RankingTable';
import BidSubmissionForm from '../components/BidSubmissionForm';
import ActivityTimeline from '../components/ActivityTimeline';
import BidHistoryTable from '../components/BidHistoryTable';
import { formatCurrency, formatTimestamp } from '../utils/formatters';

type RoomTab = 'rankings' | 'history' | 'activity' | 'suppliers';

export default function AuctionDetailPage() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const { user } = useAuth();
  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [bids, setBids] = useState<BidItem[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<RoomTab>('rankings');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveNotice, setLiveNotice] = useState<{ tone: 'amber' | 'red' | 'blue'; text: string } | null>(
    null
  );

  const loadAll = useCallback(async () => {
    if (!rfqId) return;
    setError('');
    try {
      const [stateData, bidList, logList] = await Promise.all([
        rfqApi.getAuctionState(rfqId),
        rfqApi.listBids(rfqId),
        rfqApi.getActivity(rfqId),
      ]);
      setAuction(stateData);
      setBids(bidList);
      setActivity(logList);

      if (user?.role === 'BUYER') {
        authApi.listSuppliers().then(setAllSuppliers).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load auction.');
    } finally {
      setLoading(false);
    }
  }, [rfqId, user?.role]);

  useEffect(() => {
    setLoading(true);
    setLiveNotice(null);
    loadAll();
  }, [loadAll, user?.id]);

  const handleWsEvent = useCallback(
    (event: AuctionWsEvent) => {
      if (event.type === 'AUCTION_EXTENDED' && event.data) {
        const reasons = Array.isArray(event.data.reasons)
          ? (event.data.reasons as string[]).join(', ')
          : 'Trigger';
        const nextClose = String(event.data.bid_close_time || '');
        setLiveNotice({
          tone: 'amber',
          text: `Auction automatically extended to ${formatTimestamp(nextClose)} (${reasons}).`,
        });
      } else if (event.type === 'AUCTION_FORCE_CLOSED') {
        setLiveNotice({
          tone: 'red',
          text: 'Auction has reached its forced close limit and is now closed.',
        });
      } else if (event.type === 'AUCTION_CLOSED') {
        setLiveNotice({
          tone: 'blue',
          text: 'Auction bidding window has closed.',
        });
      }
      loadAll();
    },
    [loadAll]
  );

  const { connected: wsConnected } = useAuctionSocket(rfqId, user?.id, handleWsEvent);

  if (loading) {
    return <div className="text-sm text-slate-500">Loading auction room...</div>;
  }

  if (error || !auction) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-3">
        <div className="text-sm font-semibold text-red-700">{error || 'Auction not found.'}</div>
        <Link to="/auctions" className="inline-block text-xs font-semibold text-blue-700 hover:underline">
          Return to Auctions
        </Link>
      </div>
    );
  }

  const { rfq, rankings, in_trigger_window, server_time } = auction;
  const isBuyer = user?.role === 'BUYER';
  const isSupplier = user?.role === 'SUPPLIER';
  const myRanking = rankings.find((r) => r.is_current_user) ?? null;
  const currentLowest = rankings.length > 0 ? rankings[0].total_amount : null;

  const activeTriggers: string[] = [];
  if (rfq.auction_config.bid_received_enabled) activeTriggers.push('Bid Received');
  if (rfq.auction_config.any_rank_change_enabled) activeTriggers.push('Any Rank Change');
  if (rfq.auction_config.l1_rank_change_enabled) activeTriggers.push('L1 Rank Change');

  const uninvitedSuppliers = allSuppliers.filter(
    (s) => !rfq.invited_suppliers.some((inv) => inv.supplier_id === s.id)
  );

  const handleInviteSupplier = async (supplierId: string) => {
    if (!rfqId) return;
    await rfqApi.inviteSuppliers(rfqId, [supplierId]);
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/auctions"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Auctions
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{rfq.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-mono-tabular font-medium text-slate-700">{rfq.reference_id}</span>
            <span aria-hidden="true">·</span>
            <span>
              {rfq.origin} → {rfq.destination}
            </span>
            <span aria-hidden="true">·</span>
            <span>Pickup {rfq.pickup_date}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-500">Current Lowest Bid (L1)</div>
          <div className="mt-0.5 text-2xl font-bold font-mono-tabular text-emerald-700">
            {formatCurrency(currentLowest)}
          </div>
          {isSupplier && (
            <div className="text-xs text-slate-600 mt-0.5">
              Your standing:{' '}
              <strong className="font-mono-tabular text-slate-900">
                {myRanking ? `${myRanking.rank_label} (${formatCurrency(myRanking.total_amount)})` : 'No bid placed'}
              </strong>
            </div>
          )}
        </div>
      </div>

      {liveNotice && (
        <div
          className={`text-sm px-4 py-3 rounded-lg border ${
            liveNotice.tone === 'amber'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : liveNotice.tone === 'red'
              ? 'bg-red-50 border-red-200 text-red-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
          {liveNotice.text}
        </div>
      )}

      <CountdownBanner
        rfq={rfq}
        serverTime={server_time}
        inTriggerWindow={in_trigger_window}
        wsConnected={wsConnected}
      />

      <div className="bg-white border border-slate-200 rounded-lg px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-slate-600">
          <span>
            Trigger Window (X):{' '}
            <strong className="font-mono-tabular text-slate-900">
              {rfq.auction_config.trigger_window_minutes} min
            </strong>
          </span>
          <span>
            Extension Duration (Y):{' '}
            <strong className="font-mono-tabular text-slate-900">
              +{rfq.auction_config.extension_duration_minutes} min
            </strong>
          </span>
          <span>
            Active Triggers:{' '}
            <strong className="text-slate-900">{activeTriggers.join(' · ')}</strong>
          </span>
        </div>
        <div className="text-slate-500 font-mono-tabular">
          Extensions applied: <strong className="text-slate-900">{rfq.extension_count}</strong>
        </div>
      </div>

      {isSupplier && rfq.status === 'ACTIVE' && (
        <BidSubmissionForm
          previousTotal={myRanking ? myRanking.total_amount : null}
          currentLowest={currentLowest}
          disabled={rfq.status !== 'ACTIVE'}
          onSubmit={async (payload) => {
            const res = await rfqApi.submitBid(rfq.id, payload);
            if (res.auction_extended) {
              setLiveNotice({
                tone: 'amber',
                text: `Your bid triggered an automatic extension until ${formatTimestamp(
                  res.current_close_time
                )} (${res.extension_reasons.join(', ')}).`,
              });
            }
            await loadAll();
          }}
        />
      )}

      {isSupplier && rfq.status !== 'ACTIVE' && (
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4 text-sm text-slate-600">
          {rfq.status === 'UPCOMING'
            ? `Bidding opens at ${formatTimestamp(rfq.bid_start_time)}. Quotations cannot be submitted before the start time.`
            : 'This auction is closed and no longer accepts new quotations.'}
        </div>
      )}

      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('rankings')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
            activeTab === 'rankings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Live Rankings ({rankings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
            activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {isBuyer ? `All Bid History (${bids.length})` : `My Bid History (${bids.length})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
            activeTab === 'activity' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Activity Log ({activity.length})
        </button>
        {isBuyer && (
          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
              activeTab === 'suppliers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Invited Suppliers ({rfq.invited_suppliers.length})
          </button>
        )}
      </div>

      {activeTab === 'rankings' && (
        <RankingTable rankings={rankings} viewerRole={user?.role ?? 'SUPPLIER'} />
      )}

      {activeTab === 'history' && (
        <BidHistoryTable bids={bids} viewerRole={user?.role ?? 'SUPPLIER'} />
      )}

      {activeTab === 'activity' && <ActivityTimeline logs={activity} />}

      {activeTab === 'suppliers' && isBuyer && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Invited Suppliers</h2>
            <div className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-md">
              {rfq.invited_suppliers.map((inv) => (
                <div key={inv.supplier_id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium text-slate-900">{inv.name}</div>
                    <div className="text-xs text-slate-500">{inv.email}</div>
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-500">
                    Invited {formatTimestamp(inv.invited_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {uninvitedSuppliers.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-700 mb-2">Invite Additional Suppliers</h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {uninvitedSuppliers.map((sup) => (
                  <div key={sup.id} className="px-4 py-3 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium text-slate-900">{sup.name}</div>
                      <div className="text-xs text-slate-500">{sup.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInviteSupplier(sup.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50"
                    >
                      Invite
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
