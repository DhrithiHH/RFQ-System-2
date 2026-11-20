import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, rfqApi } from '../services/api';
import type { UserProfile } from '../types';

function toLocalDateTimeInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function CreateRfqPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<UserProfile[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const [name, setName] = useState('');
  const [referenceId, setReferenceId] = useState(
    `RFQ-${now.getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`
  );
  const [origin, setOrigin] = useState('Nhava Sheva, IN');
  const [destination, setDestination] = useState('Antwerp, BE');
  const [pickupDate, setPickupDate] = useState(
    new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  );
  const [bidStart, setBidStart] = useState(toLocalDateTimeInput(now));
  const [bidClose, setBidClose] = useState(toLocalDateTimeInput(new Date(Date.now() + 30 * 60_000)));
  const [forcedClose, setForcedClose] = useState(
    toLocalDateTimeInput(new Date(Date.now() + 60 * 60_000))
  );
  const [triggerWindow, setTriggerWindow] = useState('10');
  const [extensionDuration, setExtensionDuration] = useState('5');
  const [bidReceivedEnabled, setBidReceivedEnabled] = useState(true);
  const [anyRankChangeEnabled, setAnyRankChangeEnabled] = useState(true);
  const [l1RankChangeEnabled, setL1RankChangeEnabled] = useState(false);

  useEffect(() => {
    authApi.listSuppliers().then((list) => {
      setSuppliers(list);
      setSelectedSuppliers(list.map((s) => s.id));
    });
  }, []);

  const applyFastTestPreset = () => {
    const t = Date.now();
    setBidStart(toLocalDateTimeInput(new Date(t - 60_000)));
    setBidClose(toLocalDateTimeInput(new Date(t + 4 * 60_000)));
    setForcedClose(toLocalDateTimeInput(new Date(t + 12 * 60_000)));
    setTriggerWindow('5');
    setExtensionDuration('3');
    setBidReceivedEnabled(true);
    setAnyRankChangeEnabled(true);
    setL1RankChangeEnabled(true);
  };

  const toggleSupplier = (id: string) => {
    setSelectedSuppliers((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const startIso = new Date(bidStart).toISOString();
    const closeIso = new Date(bidClose).toISOString();
    const forcedIso = new Date(forcedClose).toISOString();

    if (Date.parse(startIso) >= Date.parse(closeIso)) {
      setError('Bid start time must be strictly earlier than bid close time.');
      return;
    }
    if (Date.parse(forcedIso) <= Date.parse(closeIso)) {
      setError('Forced bid close time must be strictly later than bid close time.');
      return;
    }
    if (!bidReceivedEnabled && !anyRankChangeEnabled && !l1RankChangeEnabled) {
      setError('Enable at least one British Auction extension trigger.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await rfqApi.create({
        name: name.trim(),
        reference_id: referenceId.trim(),
        origin: origin.trim(),
        destination: destination.trim(),
        pickup_date: pickupDate,
        bid_start_time: startIso,
        bid_close_time: closeIso,
        forced_close_time: forcedIso,
        supplier_ids: selectedSuppliers,
        auction_config: {
          trigger_window_minutes: Number.parseInt(triggerWindow, 10),
          extension_duration_minutes: Number.parseInt(extensionDuration, 10),
          bid_received_enabled: bidReceivedEnabled,
          any_rank_change_enabled: anyRankChangeEnabled,
          l1_rank_change_enabled: l1RankChangeEnabled,
        },
      });
      navigate(`/auctions/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create RFQ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create British Auction RFQ
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure shipment lane, bidding schedule, forced close cap, extension triggers, and invited suppliers.
          </p>
        </div>

        <button
          type="button"
          onClick={applyFastTestPreset}
          className="px-3.5 py-2 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50/50 rounded-md hover:bg-blue-50 transition-colors whitespace-nowrap"
        >
          Apply 4-Min Live Trigger Preset
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <h2 className="text-sm font-semibold text-slate-900">1. Shipment & Schedule</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">RFQ Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mundra to Antwerp — 40ft Dry FCL"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Reference ID</label>
            <input
              required
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Pickup / Service Date</label>
            <input
              type="date"
              required
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Origin</label>
            <input
              required
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Destination</label>
            <input
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Bid Start Date & Time</label>
            <input
              type="datetime-local"
              required
              value={bidStart}
              onChange={(e) => setBidStart(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Bid Close Date & Time</label>
            <input
              type="datetime-local"
              required
              value={bidClose}
              onChange={(e) => setBidClose(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Forced Bid Close Date & Time (Hard Ceiling)
            </label>
            <input
              type="datetime-local"
              required
              value={forcedClose}
              onChange={(e) => setForcedClose(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
            <p className="text-xs text-slate-500 mt-1">
              Must be strictly later than Bid Close Time. Extensions are always capped at this timestamp.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <h2 className="text-sm font-semibold text-slate-900">2. British Auction Extension Rules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Trigger Window X (Minutes)
            </label>
            <input
              type="number"
              min="1"
              required
              value={triggerWindow}
              onChange={(e) => setTriggerWindow(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Extension Duration Y (Minutes)
            </label>
            <input
              type="number"
              min="1"
              required
              value={extensionDuration}
              onChange={(e) => setExtensionDuration(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          <div className="text-xs font-medium text-slate-700">Active Extension Triggers (in last X minutes)</div>
          <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={bidReceivedEnabled}
              onChange={(e) => setBidReceivedEnabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong className="font-medium text-slate-900">Bid Received</strong> — Extend whenever any valid supplier bid arrives inside the trigger window.
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={anyRankChangeEnabled}
              onChange={(e) => setAnyRankChangeEnabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong className="font-medium text-slate-900">Any Supplier Rank Change</strong> — Extend when any supplier changes position in L1, L2, L3...
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={l1RankChangeEnabled}
              onChange={(e) => setL1RankChangeEnabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              <strong className="font-medium text-slate-900">Lowest Bidder (L1) Rank Change</strong> — Extend only when a new supplier takes the L1 lead.
            </span>
          </label>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">3. Invite Suppliers</h2>
          <span className="text-xs text-slate-500">{selectedSuppliers.length} selected</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {suppliers.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedSuppliers.includes(s.id)}
                onChange={() => toggleSupplier(s.id)}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{s.name}</div>
                <div className="text-xs text-slate-500 truncate">{s.email}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate('/auctions')}
          className="px-4 py-2.5 text-sm font-medium text-slate-700 border border-slate-200 bg-white rounded-md hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Publishing RFQ...' : 'Publish British Auction RFQ'}
        </button>
      </div>
    </form>
  );
}
